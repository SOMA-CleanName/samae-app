"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { readMetaAdCookies, type MetaAdCookies } from "@/lib/meta-capi";
import { rememberInquiryIds } from "@/lib/my-inquiries";
import { promoteBotInquiryToChat } from "@/lib/inquiry-bot-chat";
import { slotsToAnswers, type BotChatMessage } from "@/lib/inquiry-bot-llm";
import { buildFlow, toInquiryFields } from "@/lib/inquiry-bot";

export type InquiryState = {
  ok: boolean;
  message?: string;
  error?: string;
  values?: InquiryValues;
  // 접수된 문의 id — 클라이언트가 Mixpanel 전환 기록·중복 발화 가드에 사용
  inquiryId?: string;
};

const PHONE_PATTERN = /^0\d{2}-\d{4}-\d{4}$/;
const REF_IMAGE_BUCKET = "samae-chat";
const MAX_REF_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_REF_IMAGES = 5;

export type InquiryValues = {
  phone: string;
  kakaoId: string;
  contactEmail: string;
  brief: InquiryBriefValues;
};

type ContactInfo = {
  phone: string | null;
  kakaoId: string | null;
  contactEmail: string | null;
};

// 유입 어트리뷰션 — 클라이언트(InquiryChat)가 sessionStorage 값을 FormData 로 실어 보낸다.
type Acquisition = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  landingPath: string | null;
};

function readAcquisition(formData: FormData): Acquisition {
  const cap = (v: string | null, n: number) => (v ? v.slice(0, n) : null);
  return {
    utmSource: cap(fieldText(formData, "utm_source"), 200),
    utmMedium: cap(fieldText(formData, "utm_medium"), 200),
    utmCampaign: cap(fieldText(formData, "utm_campaign"), 200),
    utmContent: cap(fieldText(formData, "utm_content"), 200),
    utmTerm: cap(fieldText(formData, "utm_term"), 200),
    landingPath: cap(fieldText(formData, "landing_path"), 300),
  };
}

type BriefInfo = {
  partySize: string | null;
  purpose: string | null;
  preferredDate: string | null;
  region: string | null;
  note: string | null;
  gender: string | null;
  name: string | null;
  refImagePaths: string[];
};

type InquiryBriefValues = {
  partySize: string;
  purpose: string;
  preferredDate: string;
  region: string;
  note: string;
  gender: string;
  name: string;
};

function validatePhone(phone: string | null) {
  if (!phone) return null;
  const formatted = formatPhone(phone);
  if (!PHONE_PATTERN.test(formatted)) {
    throw new Error("전화번호는 010-1234-5678 형식으로 입력해주세요.");
  }
  return formatted;
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function fieldText(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  return value || null;
}

function validateContactInfo(formData: FormData): ContactInfo {
  const phone = validatePhone(fieldText(formData, "phone"));
  const kakaoId = fieldText(formData, "kakaoId");
  const contactEmail = validateEmail(fieldText(formData, "contactEmail"));

  if (!phone && !kakaoId && !contactEmail) {
    throw new Error("연락 가능한 수단을 하나 이상 입력해주세요.");
  }

  return { phone, kakaoId, contactEmail };
}

function validateEmail(email: string | null) {
  if (!email) return null;
  if (!EMAIL_RE.test(email)) {
    throw new Error("이메일 형식을 확인해주세요. 예: id@gmail.com");
  }
  return email;
}

function validateBriefInfo(formData: FormData): BriefInfo {
  return readBriefInfo(formData);
}

function readInquiryValues(formData: FormData): InquiryValues {
  return {
    phone: String(formData.get("phone") || ""),
    kakaoId: String(formData.get("kakaoId") || ""),
    contactEmail: String(formData.get("contactEmail") || ""),
    brief: readBriefValues(formData),
  };
}

function readBriefValues(formData: FormData) {
  return {
    partySize: String(formData.get("partySize") || ""),
    purpose: String(formData.get("purpose") || ""),
    preferredDate: String(formData.get("preferredDate") || ""),
    region: String(formData.get("region") || ""),
    note: String(formData.get("note") || ""),
    gender: String(formData.get("gender") || ""),
    name: String(formData.get("name") || ""),
  };
}

function readBriefInfo(formData: FormData): BriefInfo {
  const values = readBriefValues(formData);
  return {
    partySize: values.partySize.trim() || null,
    purpose: values.purpose.trim() || null,
    preferredDate: values.preferredDate.trim() || null,
    region: values.region.trim() || null,
    note: values.note.trim() || null,
    gender: values.gender.trim() || null,
    name: values.name.trim() || null,
    refImagePaths: [],
  };
}

// 챗봇 첫 발화 시 대화방 선생성 — "채팅을 시작한 순간 방이 생긴다"는 멘탈 모델.
// 진행 중(미접수) 방도 문의 탭에 떠서 이어서 진행할 수 있다. 실패해도 대화는 계속.
export async function ensureBotConversation(
  photographerId: string,
  photoId: string | null
): Promise<string | null> {
  try {
    const me = await getCurrentUser();
    if (!me || !photographerId) return null;
    if (me.photographer?.id === photographerId) return null; // 본인 방 방지
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("conversations")
      .select("id, bot_photo_id")
      .eq("user_id", me.id)
      .eq("photographer_id", photographerId)
      .maybeSingle();
    if (existing) {
      // 다른 사진으로 새 문의를 시작했으면 복귀 사진만 갱신
      if (photoId && existing.bot_photo_id !== photoId)
        await admin.from("conversations").update({ bot_photo_id: photoId }).eq("id", existing.id);
      return existing.id as string;
    }
    const { data: created } = await admin
      .from("conversations")
      .insert({ user_id: me.id, photographer_id: photographerId, bot_photo_id: photoId })
      .select("id")
      .single();
    return (created?.id as string) ?? null;
  } catch (err) {
    console.error("[bot-chat] 방 선생성 실패:", err instanceof Error ? err.message : err);
    return null;
  }
}

// 문의 체크리스트 동기화 — 봇이 수집한 슬롯을 대화에 저장해 작가 화면에서
// "무엇이 확인됐고 무엇이 남았는지"를 실시간으로 보게 한다. 실패해도 대화 계속.
export async function syncBotSlots(
  conversationId: string,
  slots: Record<string, unknown>
): Promise<void> {
  try {
    const me = await getCurrentUser();
    if (!me || !conversationId || !slots || typeof slots !== "object") return;
    // 코어 4슬롯 + custom 만, 문자열만 통과 (임의 페이로드 저장 방지)
    const clean: Record<string, unknown> = {};
    for (const k of ["purpose", "preferredDate", "region", "partySize"] as const) {
      const v = slots[k];
      if (typeof v === "string" && v.trim()) clean[k] = v.trim().slice(0, 200);
    }
    const custom = slots.custom;
    if (custom && typeof custom === "object" && !Array.isArray(custom)) {
      const c: Record<string, string> = {};
      for (const [k, v] of Object.entries(custom as Record<string, unknown>).slice(0, 10)) {
        if (typeof v === "string" && v.trim()) c[k.slice(0, 80)] = v.trim().slice(0, 300);
      }
      if (Object.keys(c).length > 0) clean.custom = c;
    }
    const admin = createAdminClient();
    const { data: conv } = await admin
      .from("conversations")
      .select("id, user_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv || conv.user_id !== me.id) return; // 내 방만
    await admin.from("conversations").update({ bot_slots: clean }).eq("id", conversationId);
  } catch (err) {
    console.error("[bot-chat] 슬롯 동기화 실패:", err instanceof Error ? err.message : err);
  }
}

// 챗봇 대화 실시간 동기화 — 매 턴 새 발화를 messages(type='bot')로 저장.
// 작가가 진행 중에도 방에서 대화를 보고 개입할 수 있게 하는 핵심 배선. 실패해도 대화 계속.
export async function appendBotTurns(
  conversationId: string,
  turns: { role: "user" | "bot" | "photographer"; text: string }[]
): Promise<boolean> {
  try {
    const me = await getCurrentUser();
    if (!me || !conversationId || turns.length === 0) return false;
    if (turns.length > 40) return false; // 폭주 가드
    const admin = createAdminClient();
    const { data: conv } = await admin
      .from("conversations")
      .select("id, user_id, photographer_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv || conv.user_id !== me.id) return false; // 내 방만
    const { data: photographer } = await admin
      .from("photographers")
      .select("profile_id")
      .eq("id", conv.photographer_id)
      .single();
    // photographer 역할 발화는 실제 작가 메시지(type='text')로 이미 존재 — 중복 저장 금지
    const rows = turns
      .filter((t) => t.role !== "photographer" && t.text.trim().length > 0)
      .map((t, i) => ({
        conversation_id: conversationId,
        sender_id: t.role === "user" ? me.id : (photographer!.profile_id as string),
        type: "bot" as const,
        body: t.text.slice(0, 4000),
        created_at: new Date(Date.now() - (turns.length - i) * 20).toISOString(), // 순서 고정
      }));
    if (rows.length === 0) return true;
    const { error } = await admin.from("messages").insert(rows);
    return !error;
  } catch (err) {
    console.error("[bot-chat] 턴 동기화 실패:", err instanceof Error ? err.message : err);
    return false;
  }
}

// 문의 폼 제출 — 연락 수단 검증을 통과하면 작가에게 알림을 보낸다.
export async function submitInquiry(
  _prevState: InquiryState,
  formData: FormData
): Promise<InquiryState> {
  const photographerId = String(formData.get("photographerId") || "");
  const photoId = String(formData.get("photoId") || "");
  const values = readInquiryValues(formData);
  const me = await getCurrentUser();

  let contact: ContactInfo;
  let brief: BriefInfo;
  try {
    contact = validateContactInfo(formData);
    brief = validateBriefInfo(formData);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "연락 수단을 확인해주세요.",
      values,
    };
  }

  if (me) {
    const supabase = await createClient();
    // 이번에 입력한 수단만 갱신 — 카톡ID만 제출해도 기존 phone 이 null 로 덮이지 않게
    // (SMS 재소환이 profiles.phone 에 의존하므로 번호 유실은 알림 유실이다)
    const patch: Record<string, string> = {};
    if (contact.phone) patch.phone = contact.phone;
    if (contact.kakaoId) patch.kakao_id = contact.kakaoId;
    if (contact.contactEmail) patch.contact_email = contact.contactEmail;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("profiles").update(patch).eq("id", me.id);
      if (error) return { ok: false, error: error.message, values };
    }
  }

  brief.refImagePaths = await uploadReferenceImages(formData);

  // 광고 식별자 — 접수 시점에만 읽을 수 있다(입금 확인은 운영자가 누르므로 그땐 없음).
  const ad = await readMetaAdCookies();
  const acq = readAcquisition(formData);

  const result = await createInquiry(me?.id ?? null, photographerId, photoId, contact, brief, ad, acq);
  if (!result) return { ok: false, error: "문의 저장에 실패했어요.", values };
  const { id: inquiryId, isNew } = result;

  // 비로그인 '내 문의' 내역용 — 쿠키에 문의 id 보관(재제출/중복이어도 보관)
  await rememberInquiryIds([inquiryId]);

  // 연타·재제출로 기존 리드를 재사용한 경우엔 알림을 다시 보내지 않는다.
  // (Meta Lead 전환은 문의 완료가 아니라 '무료로 견적 받아보기' CTA 클릭에서 발화)
  if (isNew) {
    await notifyPhotographer(photographerId, inquiryId, me?.displayName ?? null, contact, brief);

    // 운영(디스코드) 알림은 접수 시점에 울리지 않는다 — 체결·입금 신고에서만 (에스크로 전환).

    // C3 — 챗봇 대화·요약을 채팅방으로 승격 (로그인 사용자만: 방은 user↔photographer 1:1).
    // 실패해도 접수는 이미 성공 — 부가 경로라 결과만 로그.
    if (me) {
      let transcript: BotChatMessage[] = [];
      try {
        const raw = String(formData.get("botTranscript") || "");
        if (raw) transcript = JSON.parse(raw) as BotChatMessage[];
      } catch {
        transcript = [];
      }
      await promoteBotInquiryToChat({
        userId: me.id,
        photographerId,
        transcript,
        summary: {
          inquiryId,
          photoId: photoId || null,
          purpose: brief.purpose ?? "문의",
          preferredDate: brief.preferredDate ?? "미정",
          region: brief.region ?? "미정",
          partySize: brief.partySize,
          note: brief.note,
        },
      });
    }
  }

  return {
    ok: true,
    message: "문의가 작가에게 전달되었어요. 작가가 확인 후 연락드릴 예정입니다.",
    inquiryId,
  };
}

// 채팅방 상주 봇 접수 — 고객 컨텍스트 없이도(작가 개입 트리거 포함) 서버가 대신 접수한다.
// submitInquiry 와 같은 저장·알림·승격 경로의 축약판. 중복은 findRecentDuplicate +
// promote 의 summary dedupe 로 방지 (호출부도 summary_card 존재를 선검사한다).
export async function finalizeBotInquiryFor(params: {
  customerId: string;
  photographerId: string;
  photoId: string | null;
  slots: import("@/lib/inquiry-bot-llm").LlmSlots;
  /** 작가 본인 개입으로 트리거된 접수면 작가 알림 생략 (본인이 이미 보고 있다) */
  notifyPhotographerFlag: boolean;
}): Promise<{ ok: boolean; inquiryId?: string }> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("phone, display_name")
    .eq("id", params.customerId)
    .maybeSingle();
  const rawPhone = profile?.phone ?? null;
  if (!rawPhone) return { ok: false }; // 알림 연락처 없이는 접수 보류

  const d = rawPhone.replace(/\D/g, "");
  const contact: ContactInfo = {
    phone: d.length >= 10 ? `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}` : rawPhone,
    kakaoId: null,
    contactEmail: null,
  };
  const fields = toInquiryFields(buildFlow(), slotsToAnswers(params.slots));
  const customLines = Object.entries(params.slots.custom ?? {}).map(([k, v]) => `${k}: ${v}`);
  const brief: BriefInfo = {
    partySize: fields.partySize || null,
    purpose: fields.purpose || "문의",
    preferredDate: fields.preferredDate || "미정",
    region: fields.region || "미정",
    note: customLines.length > 0 ? `[챗봇 수집]\n${customLines.join("\n")}` : null,
    gender: null,
    name: null,
    refImagePaths: [],
  };
  const result = await createInquiry(
    params.customerId,
    params.photographerId,
    params.photoId ?? "",
    contact,
    brief,
    { fbp: null, fbc: null },
    { utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null, landingPath: null }
  );
  if (!result) return { ok: false };
  if (result.isNew) {
    if (params.notifyPhotographerFlag) {
      await notifyPhotographer(
        params.photographerId,
        result.id,
        profile?.display_name ?? null,
        contact,
        brief
      );
    }
    // 운영(디스코드) 알림은 여기서 울리지 않는다 — 실제 비즈니스 트리거는
    // 체결(notifyOpsBookingAccepted)·입금 신고(notifyOpsBookingDeposit)에서.
    await promoteBotInquiryToChat({
      userId: params.customerId,
      photographerId: params.photographerId,
      transcript: [], // 대화는 이미 방(DB)에 있다
      summary: {
        inquiryId: result.id,
        photoId: params.photoId,
        purpose: brief.purpose ?? "문의",
        preferredDate: brief.preferredDate ?? "미정",
        region: brief.region ?? "미정",
        partySize: brief.partySize,
        note: brief.note,
      },
    });
  }
  return { ok: true, inquiryId: result.id };
}

// 같은 작가에게 최근 2분 내 동일인(로그인=profile_id, 비로그인=연락처) 문의가 있으면 그 id 재사용
// → 연타·재제출 시 리드 중복 적재 방지. 다른 작가에게의 문의는 별개 리드로 허용.
async function findRecentDuplicate(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string | null,
  photographerId: string,
  contact: ContactInfo
): Promise<string | null> {
  const since = new Date(Date.now() - 120_000).toISOString();
  let q = admin
    .from("inquiries")
    .select("id")
    .eq("photographer_id", photographerId)
    .eq("status", "new")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);

  if (profileId) q = q.eq("profile_id", profileId);
  else if (contact.phone) q = q.eq("phone", contact.phone);
  else if (contact.kakaoId) q = q.eq("kakao_id", contact.kakaoId);
  else if (contact.contactEmail) q = q.eq("contact_email", contact.contactEmail);
  else return null; // 식별 수단이 없으면 중복 판정 생략

  const { data } = await q;
  return data && data.length > 0 ? (data[0].id as string) : null;
}

async function createInquiry(
  profileId: string | null,
  photographerId: string,
  photoId: string,
  contact: ContactInfo,
  brief: BriefInfo,
  ad: MetaAdCookies,
  acq: Acquisition
): Promise<{ id: string; isNew: boolean } | null> {
  const admin = createAdminClient();

  // 재사용된 리드는 최초 접수 때의 광고 식별자·유입정보를 유지한다(first-touch).
  const dupId = await findRecentDuplicate(admin, profileId, photographerId, contact);
  if (dupId) return { id: dupId, isNew: false };

  const { data, error } = await admin
    .from("inquiries")
    .insert({
      profile_id: profileId,
      photographer_id: photographerId,
      source_photo_id: photoId || null,
      phone: contact.phone,
      kakao_id: contact.kakaoId,
      contact_email: contact.contactEmail,
      party_size: brief.partySize,
      purpose: brief.purpose,
      preferred_date: brief.preferredDate,
      region: brief.region,
      note: brief.note,
      gender: brief.gender,
      name: brief.name,
      ref_image_paths: brief.refImagePaths,
      fbp: ad.fbp,
      fbc: ad.fbc,
      utm_source: acq.utmSource,
      utm_medium: acq.utmMedium,
      utm_campaign: acq.utmCampaign,
      utm_content: acq.utmContent,
      utm_term: acq.utmTerm,
      landing_path: acq.landingPath,
    })
    .select("id")
    .single();

  if (error) return null;
  return { id: data.id as string, isNew: true };
}

async function notifyPhotographer(
  photographerId: string,
  inquiryId: string,
  displayName: string | null,
  contact: ContactInfo,
  brief: BriefInfo
) {
  const admin = createAdminClient();
  const { data: photographer } = await admin
    .from("photographers")
    .select("profile_id")
    .eq("id", photographerId)
    .maybeSingle();

  if (!photographer?.profile_id) return;

  await admin.from("notifications").insert({
    recipient_id: photographer.profile_id,
    type: "booking",
    title: "새 문의가 도착했어요",
    body: buildInquiryBody(displayName, contact, brief),
    link: null,
    inquiry_id: inquiryId,
  });
}

function inquiryNickname(displayName: string | null, name: string | null) {
  // 연락처(전화/카톡/이메일)는 입금 확인 전 노출 금지 — 닉네임엔 이름/닉네임만 사용.
  return displayName || name || "비회원";
}

// 알림 본문에는 연락처(전화/카톡/이메일)를 절대 담지 않는다.
// 연락처는 운영자 입금 확인(status='confirmed') 후 listMyAcceptedInquiries 경로로만 공개된다.
function buildInquiryBody(displayName: string | null, _contact: ContactInfo, brief: BriefInfo) {
  const lines = [
    `${inquiryNickname(displayName, brief.name)} 님이 예약 문의를 하였습니다.`,
    brief.purpose && `목적: ${brief.purpose}`,
    brief.preferredDate && `희망 일정: ${brief.preferredDate}`,
    brief.region && `희망 지역: ${brief.region}`,
    brief.refImagePaths.length > 0 && `레퍼런스 사진: ${brief.refImagePaths.length}장`,
    "수락 후 입금이 확인되면 연락처가 공개됩니다.",
  ].filter(Boolean);

  return lines.join("\n");
}

async function uploadReferenceImages(formData: FormData) {
  const files = formData
    .getAll("referenceImages")
    .filter((file): file is File => file instanceof File && file.size > 0)
    .slice(0, MAX_REF_IMAGES);
  if (files.length === 0) return [];

  const admin = createAdminClient();
  const sharp = (await import("sharp")).default;
  const uploaded: string[] = [];

  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    if (file.size > MAX_REF_IMAGE_BYTES) continue;

    const buffer = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const path = `inquiries/${randomUUID()}.jpg`;
    const { error } = await admin.storage
      .from(REF_IMAGE_BUCKET)
      .upload(path, buffer, { contentType: "image/jpeg" });
    if (error) continue;
    uploaded.push(admin.storage.from(REF_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl);
  }

  return uploaded;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── 찜 여러 장 묶음 상담(채팅) — 작가별로 같은 내용 각각 전송, 같은 작가는 하나만 ──
export async function submitMultiInquiry(
  _prevState: InquiryState,
  formData: FormData
): Promise<InquiryState> {
  const photoIds = [
    ...new Set(
      String(formData.get("photoIds") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];
  const values = readInquiryValues(formData);
  const me = await getCurrentUser();

  let contact: ContactInfo;
  let brief: BriefInfo;
  try {
    contact = validateContactInfo(formData);
    brief = validateBriefInfo(formData);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "연락 수단을 확인해주세요.",
      values,
    };
  }
  if (photoIds.length === 0) return { ok: false, error: "선택한 사진이 없어요.", values };

  if (me) {
    const supabase = await createClient();
    await supabase
      .from("profiles")
      .update({
        phone: contact.phone,
        kakao_id: contact.kakaoId,
        contact_email: contact.contactEmail,
      })
      .eq("id", me.id);
  }

  brief.refImagePaths = await uploadReferenceImages(formData);

  // 사진 → 작가 매핑. 같은 작가는 대표 사진 1장으로 묶어 문의 1건만 생성.
  const admin = createAdminClient();
  const { data: photos } = await admin
    .from("photos")
    .select("id, photographer_id")
    .in("id", photoIds);

  const repByPhotographer = new Map<string, string>(); // photographer_id → 대표 photoId
  for (const p of (photos ?? []) as { id: string; photographer_id: string }[]) {
    if (p.photographer_id && !repByPhotographer.has(p.photographer_id)) {
      repByPhotographer.set(p.photographer_id, p.id);
    }
  }
  if (repByPhotographer.size === 0) {
    return { ok: false, error: "작가 정보를 찾지 못했어요.", values };
  }

  // 광고 식별자·유입정보 — 작가별 문의가 여러 건 생겨도 접수 1회분이므로 루프 밖에서 한 번만 읽는다.
  const ad = await readMetaAdCookies();
  const acq = readAcquisition(formData);

  let firstInquiryId: string | null = null;
  const createdIds: string[] = [];
  for (const [photographerId, repPhotoId] of repByPhotographer) {
    // 본인(작가)이 자기 사진에 보낸 건 건너뜀
    if (me?.photographer?.id === photographerId) continue;
    const result = await createInquiry(me?.id ?? null, photographerId, repPhotoId, contact, brief, ad, acq);
    if (!result) continue;
    createdIds.push(result.id);
    if (!firstInquiryId) firstInquiryId = result.id;
    if (result.isNew) {
      await notifyPhotographer(photographerId, result.id, me?.displayName ?? null, contact, brief);
    }
  }

  if (!firstInquiryId) return { ok: false, error: "문의 저장에 실패했어요.", values };

  // 비로그인 '내 문의' 내역용 — 생성된 문의 id 전부 쿠키에 보관
  await rememberInquiryIds(createdIds);

  return {
    ok: true,
    message: "선택한 사진의 작가님들에게 문의가 전달되었어요. 곧 연락드릴 예정입니다.",
    inquiryId: firstInquiryId,
  };
}

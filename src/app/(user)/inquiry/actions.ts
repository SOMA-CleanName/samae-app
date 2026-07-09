"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { notifyOpsNewInquiry, notifyOpsCartInquiry } from "@/lib/ops-alert";
import { sendCapiLead, readMetaAdCookies, type MetaAdCookies } from "@/lib/meta-capi";
import { rememberInquiryIds } from "@/lib/my-inquiries";

export type InquiryState = {
  ok: boolean;
  message?: string;
  error?: string;
  values?: InquiryValues;
  // Meta 픽셀 Lead 이벤트 중복 제거용 — 클라이언트가 eventID 로 사용
  inquiryId?: string;
};

const PHONE_PATTERN = /^0\d{2}-\d{4}-\d{4}$/;
const REF_IMAGE_BUCKET = "samae-chat";
const MAX_REF_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_REF_IMAGES = 5;

export type InquiryValues = {
  phone: string;
  instagramId: string;
  kakaoId: string;
  extraContact: string;
  brief: InquiryBriefValues;
};

type ContactInfo = {
  phone: string | null;
  instagramId: string | null;
  kakaoId: string | null;
  extraContact: string | null;
};

type BriefInfo = {
  partySize: string | null;
  purpose: string | null;
  preferredDate: string | null;
  region: string | null;
  note: string | null;
  refImagePaths: string[];
};

type InquiryBriefValues = {
  partySize: string;
  purpose: string;
  preferredDate: string;
  region: string;
  note: string;
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
  const instagramId = normalizeInstagramId(fieldText(formData, "instagramId"));
  const kakaoId = fieldText(formData, "kakaoId");
  const extraContact = fieldText(formData, "extraContact");

  if (!phone && !instagramId && !kakaoId && !extraContact) {
    throw new Error("연락 가능한 수단을 하나 이상 입력해주세요.");
  }

  return { phone, instagramId, kakaoId, extraContact };
}

function validateBriefInfo(formData: FormData): BriefInfo {
  return readBriefInfo(formData);
}

function readInquiryValues(formData: FormData): InquiryValues {
  return {
    phone: String(formData.get("phone") || ""),
    instagramId: String(formData.get("instagramId") || ""),
    kakaoId: String(formData.get("kakaoId") || ""),
    extraContact: String(formData.get("extraContact") || ""),
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
    refImagePaths: [],
  };
}

function normalizeInstagramId(value: string | null) {
  if (!value) return null;
  const id = value.startsWith("@") ? value : `@${value}`;
  return id.replace(/\s/g, "");
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
    const { error } = await supabase
      .from("profiles")
      .update({
        phone: contact.phone,
        instagram_id: contact.instagramId,
        kakao_id: contact.kakaoId,
        extra_contact: contact.extraContact,
      })
      .eq("id", me.id);
    if (error) return { ok: false, error: error.message, values };
  }

  brief.refImagePaths = await uploadReferenceImages(formData);

  // 광고 식별자 — 접수 시점에만 읽을 수 있다(입금 확인은 운영자가 누르므로 그땐 없음).
  const ad = await readMetaAdCookies();

  const result = await createInquiry(me?.id ?? null, photographerId, photoId, contact, brief, ad);
  if (!result) return { ok: false, error: "문의 저장에 실패했어요.", values };
  const { id: inquiryId, isNew } = result;

  // 비로그인 '내 문의' 내역용 — 쿠키에 문의 id 보관(재제출/중복이어도 보관)
  await rememberInquiryIds([inquiryId]);

  // 연타·재제출로 기존 리드를 재사용한 경우엔 알림을 다시 보내지 않는다.
  // Lead 픽셀 이벤트는 동일 inquiryId(eventID)로 Meta 가 자동 중복 제거.
  if (isNew) {
    await notifyPhotographer(photographerId, inquiryId, me?.displayName ?? null, contact, brief);

    // 운영진 디스코드 알림 — 리드 플로우 시작(운영진이 작가에게 카톡 통보). PII 미포함, 실패해도 접수는 성공.
    await notifyOpsNewInquiry({
      inquiryId,
      photographerId,
      purpose: brief.purpose,
      preferredDate: brief.preferredDate,
      region: brief.region,
    });

    // Meta 전환 API — 서버측 Lead 전송(브라우저 픽셀 보완). 같은 eventID 로 중복 제거.
    // 이메일은 전용 필드가 없어 '기타 연락처'가 이메일 형태면 사용. (FB_CAPI_TOKEN 없으면 무동작)
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.extraContact ?? "") ? contact.extraContact : null;
    await sendCapiLead({ inquiryId, phone: contact.phone, email });
  }

  return {
    ok: true,
    message: "문의가 작가에게 전달되었어요. 작가가 확인 후 연락드릴 예정입니다.",
    inquiryId,
  };
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
  else if (contact.instagramId) q = q.eq("instagram_id", contact.instagramId);
  else if (contact.kakaoId) q = q.eq("discord_id", contact.kakaoId);
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
  ad: MetaAdCookies
): Promise<{ id: string; isNew: boolean } | null> {
  const admin = createAdminClient();

  // 재사용된 리드는 최초 접수 때의 광고 식별자를 유지한다(first-touch).
  const dupId = await findRecentDuplicate(admin, profileId, photographerId, contact);
  if (dupId) return { id: dupId, isNew: false };

  const { data, error } = await admin
    .from("inquiries")
    .insert({
      profile_id: profileId,
      photographer_id: photographerId,
      source_photo_id: photoId || null,
      phone: contact.phone,
      instagram_id: contact.instagramId,
      // discord_id 컬럼을 카카오 아이디 저장에 재사용(디스코드 채널 미사용)
      discord_id: contact.kakaoId,
      contact_email: null,
      extra_contact: contact.extraContact,
      party_size: parsePartySize(brief.partySize),
      purpose: brief.purpose,
      preferred_date: brief.preferredDate,
      region: brief.region,
      note: brief.note,
      ref_image_paths: brief.refImagePaths,
      fbp: ad.fbp,
      fbc: ad.fbc,
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

function inquiryNickname(displayName: string | null) {
  // 연락처(인스타/기타)는 입금 확인 전 노출 금지 — 닉네임 fallback에도 쓰지 않는다.
  return displayName || "비회원";
}

// 알림 본문에는 연락처(전화/인스타/기타)를 절대 담지 않는다.
// 연락처는 운영자 입금 확인(status='confirmed') 후 listMyAcceptedInquiries 경로로만 공개된다.
function buildInquiryBody(displayName: string | null, _contact: ContactInfo, brief: BriefInfo) {
  const lines = [
    `${inquiryNickname(displayName)} 님이 예약 문의를 하였습니다.`,
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

function parsePartySize(value: string | null) {
  if (!value) return null;
  const parsed = parseInt(value.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

// ── 장바구니 일괄 상담 신청 (운영진 라우팅) ───────────────────────
export type CartInquiryState = { ok: boolean; error?: string; leadId?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 담은 사진들 + 연락처를 운영진에게 일괄 전달. DB 문의행 없이 ops 알림 + Meta Lead.
export async function submitCartInquiry(
  _prev: CartInquiryState,
  formData: FormData
): Promise<CartInquiryState> {
  const contact = String(formData.get("contact") || "").trim();
  const timing = String(formData.get("timing") || "").trim() || null;
  const region = String(formData.get("region") || "").trim() || null;
  const photoIds = [
    ...new Set(
      String(formData.get("photoIds") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];
  if (!contact) return { ok: false, error: "연락받을 연락처를 입력해주세요." };
  if (photoIds.length === 0) return { ok: false, error: "담은 사진이 없어요." };

  const leadId = randomUUID();

  // 운영진 디스코드 알림 (작가 라우팅용 — 연락처 + 한정자 포함)
  await notifyOpsCartInquiry({ contact, photoIds, timing, region });

  // Meta 전환 API — 서버측 Lead (클라 픽셀과 같은 eventID 로 중복 제거)
  const email = EMAIL_RE.test(contact) ? contact : null;
  const digits = contact.replace(/\D/g, "");
  const phone = digits.length === 11 && digits.startsWith("01") ? contact : null;
  await sendCapiLead({ inquiryId: leadId, phone, email });

  return { ok: true, leadId };
}

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
        instagram_id: contact.instagramId,
        kakao_id: contact.kakaoId,
        extra_contact: contact.extraContact,
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

  // 광고 식별자 — 작가별 문의가 여러 건 생겨도 접수 1회분이므로 루프 밖에서 한 번만 읽는다.
  const ad = await readMetaAdCookies();

  let firstInquiryId: string | null = null;
  const createdIds: string[] = [];
  for (const [photographerId, repPhotoId] of repByPhotographer) {
    // 본인(작가)이 자기 사진에 보낸 건 건너뜀
    if (me?.photographer?.id === photographerId) continue;
    const result = await createInquiry(me?.id ?? null, photographerId, repPhotoId, contact, brief, ad);
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

  // Meta Lead 1회(첫 문의 기준 eventID)
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.extraContact ?? "")
    ? contact.extraContact
    : null;
  await sendCapiLead({ inquiryId: firstInquiryId, phone: contact.phone, email });

  return {
    ok: true,
    message: "선택한 사진의 작가님들에게 문의가 전달되었어요. 곧 연락드릴 예정입니다.",
    inquiryId: firstInquiryId,
  };
}

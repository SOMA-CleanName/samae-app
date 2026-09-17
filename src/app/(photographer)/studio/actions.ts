"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { mpTrackServer } from "@/lib/mixpanel-server";
import { notifyOpsPhotographerAgreed } from "@/lib/ops-alert";

// 최저가·가격 상한 (350만원)
const MAX_PRICE_KRW = 100_000_000; // 사실상 무제한(안전값 1억)

// 작가명 중복 검사 — 대소문자 무시, 본인 제외. RLS에 막히지 않게 admin으로 조회.
async function isDisplayNameTaken(name: string, exceptProfileId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("photographers")
    .select("id")
    .ilike("display_name", name)
    .neq("profile_id", exceptProfileId)
    .maybeSingle();
  return !!data;
}

// 쉼표 구분 문자열 → 중복 제거된 배열
function parseList(raw: string): string[] {
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}

/**
 * 작가 신청 — photographers 행(status=pending) 생성.
 * 승인은 운영자가 별도로 처리한다.
 */

// ─────────────────────────────────────────────
// 프로필 편집
// ─────────────────────────────────────────────
const ProfileSchema = z.object({
  displayName: z.string().trim().min(1, "작가명을 입력하세요").max(40),
  bio: z.string().trim().max(500).optional().default(""),
  regions: z.string().optional().default(""),
  moodTags: z.string().optional().default(""),
  priceFrom: z.coerce
    .number()
    .int()
    .min(0)
    .max(MAX_PRICE_KRW, "최저가는 1억원 이하로 입력해주세요")
    .optional()
    .default(0),
  bankName: z.string().trim().max(40).optional().default(""),
  accountNumber: z.string().trim().max(40).optional().default(""),
  accountHolder: z.string().trim().max(40).optional().default(""),
  legalName: z.string().trim().max(60).optional().default(""),
  businessType: z.enum(["", "general", "simplified", "unregistered"]).optional().default(""),
  businessNo: z.string().trim().max(14).optional().default(""),
});

export type ProfileState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

// 작가 프로필 수정 (RLS: 본인 행만. status는 가드 트리거로 보호됨)

// 현재 사용자의 작가 id 조회 (RLS: 본인 행)
async function getCurrentPhotographerId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("photographers")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

// ── 연락 수단 (docs/32 §3-3) ───────────────────────────────────
// 예약이 확정된 뒤 고객에게 건넬 것들. 매번 채팅에 타이핑하지 않게 미리 등록해둔다.
import { normalizeContactMethods } from "@/lib/photographer-contacts";

export async function updateProfile(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const parsed = ProfileSchema.safeParse({
    displayName: formData.get("displayName"),
    bio: formData.get("bio"),
    regions: formData.get("regions"),
    moodTags: formData.get("moodTags"),
    priceFrom: formData.get("priceFrom"),
    bankName: formData.get("bankName"),
    accountNumber: formData.get("accountNumber"),
    accountHolder: formData.get("accountHolder"),
    legalName: formData.get("legalName") ?? "",
    businessType: formData.get("businessType") ?? "",
    businessNo: formData.get("businessNo") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { error: "입력값을 확인해주세요.", fieldErrors };
  }
  const v = parsed.data;

  // 계좌는 은행·번호·예금주 3개 모두 입력하거나 모두 비워야 함(일부만 입력 → 에러 안내).
  const bank = v.bankName?.trim() ?? "";
  const number = v.accountNumber?.trim() ?? "";
  const holder = v.accountHolder?.trim() ?? "";
  const filledCount = [bank, number, holder].filter(Boolean).length;
  if (filledCount > 0 && filledCount < 3) {
    const fieldErrors: Record<string, string> = {};
    if (!bank) fieldErrors.bankName = "은행을 입력해주세요.";
    if (!number) fieldErrors.accountNumber = "계좌번호를 입력해주세요.";
    if (!holder) fieldErrors.accountHolder = "예금주를 입력해주세요.";
    return { error: "정산 계좌는 은행·계좌번호·예금주를 모두 입력해주세요.", fieldErrors };
  }

  // 사업자 정보 — 유형을 골랐고 미등록이 아니면 등록번호 10자리가 있어야 한다
  const bizDigits = v.businessNo.replace(/[^0-9]/g, "");
  if (v.businessType && v.businessType !== "unregistered" && bizDigits.length !== 10) {
    return { error: "사업자등록번호 10자리를 입력해주세요.", fieldErrors: { businessNo: "10자리 숫자" } };
  }
  const businessNo =
    v.businessType && v.businessType !== "unregistered"
      ? `${bizDigits.slice(0, 3)}-${bizDigits.slice(3, 5)}-${bizDigits.slice(5)}`
      : null;


  // 작가명 중복 불가 (본인 제외)
  if (await isDisplayNameTaken(v.displayName, user.id)) {
    return { error: "이미 사용 중인 작가명이에요.", fieldErrors: { displayName: "이미 사용 중인 작가명이에요." } };
  }

  const { error } = await supabase
    .from("photographers")
    .update({
      display_name: v.displayName,
      bio: v.bio,
      regions: parseList(v.regions),
      mood_tags: parseList(v.moodTags),
      price_from_krw: v.priceFrom,
      legal_name: v.legalName || null,
      business_type: v.businessType || null,
      business_no: businessNo,
    })
    .eq("profile_id", user.id);

  if (error) return { error: "저장 중 오류가 발생했습니다." };

  // 촬영비 수취 계좌 — payout_accounts(작가당 1행)에 upsert.
  // 사용자에게 노출되는 정보이므로 photographers 본문과 분리 저장(RLS: 소유자만 직접 조회).
  const me = await getCurrentPhotographerId(supabase, user.id);
  if (!me) return { error: "작가 정보를 찾을 수 없습니다." };

  const admin = createAdminClient();
  const hasAccount = !!(bank && number && holder);
  if (hasAccount) {
    const { error: accountError } = await admin.from("payout_accounts").upsert(
      {
        photographer_id: me,
        bank,
        number,
        holder,
      },
      { onConflict: "photographer_id" }
    );
    if (accountError) return { error: "계좌 저장 중 오류가 발생했습니다." };
  } else if (!bank && !number && !holder) {
    // 세 필드 모두 비우면 계좌 삭제
    const { error: accountError } = await admin.from("payout_accounts").delete().eq("photographer_id", me);
    if (accountError) return { error: "계좌 삭제 중 오류가 발생했습니다." };
  }

  // 공급측 계측 (PII 계좌정보는 전송하지 않음)
  await mpTrackServer("Update Studio Profile", user.id, {
    region_count: parseList(v.regions).length,
    mood_tag_count: parseList(v.moodTags).length,
    price_from_krw: v.priceFrom,
    has_bio: !!v.bio?.trim(),
  });
  if (hasAccount) {
    // 수취 계좌 등록 = 작가 활성화 핵심 지표. insert_id 고정으로 최초 1회만 집계.
    await mpTrackServer("Register Payout Account", user.id, {}, `Register Payout Account:${me}`);
  }

  // 새로고침(RSC 재렌더) 없이 저장 — 폼은 입력값을 그대로 유지하고 성공 표시만.
  // /studio·/studio/profile 은 인증 기반 동적 페이지라 다음 방문 시 자동으로 최신값 반영됨.
  return { ok: true };
}

export async function updateContactMethods(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 등록할 수 있어요.");

  let raw: unknown = [];
  try {
    raw = JSON.parse(String(formData.get("contact_methods") ?? "[]"));
  } catch {
    raw = []; // 형식이 깨져도 화면이 죽지 않게 — 빈 값으로 저장된다
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("photographers")
    .update({ contact_methods: normalizeContactMethods(raw) })
    .eq("id", me.photographer.id);
  if (error) throw new Error(error.message);

  revalidatePath("/studio/profile");
}

// ── 입점 계약 동의 (작가약관 5조 2항, 입점계약 전문) ─────────────────
// 문서 4종 체크 + 작가 정보란 + 홍보 사용 동의(선택) → photographers 갱신 + photographer_agreements 기록.
// 버전이 올라가면 studio/layout.tsx 가 다시 이 화면을 띄운다.
import { headers } from "next/headers";
import { PHOTOGRAPHER_AGREEMENT_VERSIONS } from "@/lib/consent";
import { DOC_ORDER } from "@/components/legal/photographerDocs";
import type { BusinessType } from "@/lib/platform-fee";

const BUSINESS_TYPES: BusinessType[] = ["general", "simplified", "unregistered"];

export async function agreePhotographerContract(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 동의할 수 있어요.");

  for (const key of DOC_ORDER) {
    if (formData.get(`agree_${key}`) !== "on") throw new Error("문서 4종에 모두 동의해야 해요.");
  }

  // 문서별 열람·동의 증적 — 화면이 "전문을 끝까지 연 시각" 과 "동의한 시각" 을 따로 보낸다.
  // **하나라도 없으면 거절한다.** 없다는 건 전문 화면을 거치지 않고 제출됐다는 뜻이고,
  // 그건 약관규제법 3조에서 우리가 대야 할 근거("읽을 기회를 줬다")가 비는 것이다.
  const docRecords = parseDocRecords(formData.get("docRecords"));

  const legalName = String(formData.get("legalName") || "").trim().slice(0, 60);
  if (!legalName) throw new Error("성명 또는 상호를 입력해주세요.");
  const typeRaw = String(formData.get("businessType") || "");
  if (!BUSINESS_TYPES.includes(typeRaw as BusinessType)) throw new Error("사업자 유형을 골라주세요.");
  const businessType = typeRaw as BusinessType;
  let businessNo: string | null = null;
  if (businessType !== "unregistered") {
    const digits = String(formData.get("businessNo") || "").replace(/[^0-9]/g, "");
    if (digits.length !== 10) throw new Error("사업자등록번호 10자리를 입력해주세요.");
    businessNo = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;

    // 사업자 작가는 등록증이 있어야 계약이 성립한다. 번호만으로는 세금계산서를 못 만들고
    // (필수 기재사항이 등록번호+상호+대표자다), 그 번호가 이 작가 것인지도 확인되지 않는다.
    //
    // ⚠️ 화면이 보낸 "올렸다"(hidden) 를 믿지 않는다 — 얼마든지 고쳐 보낼 수 있다.
    //    실제로 파일이 올라와 있는지 DB 를 본다.
    const { data: lic } = await createAdminClient()
      .from("photographers")
      .select("business_license_path")
      .eq("profile_id", me.id)
      .maybeSingle();
    if (!lic?.business_license_path) {
      throw new Error("사업자등록증을 올려주세요. 수수료 세금계산서 발급에 필요해요.");
    }
  }

  const promoConsent = formData.get("promoConsent") === "on";

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const userAgent = h.get("user-agent")?.slice(0, 300) ?? null;
  const now = new Date().toISOString();

  const admin = createAdminClient();
  const { error: phErr } = await admin
    .from("photographers")
    .update({
      legal_name: legalName,
      business_type: businessType,
      business_no: businessNo,
      promo_consent: promoConsent,
      promo_consent_at: promoConsent ? now : null,
    })
    .eq("id", me.photographer.id);
  if (phErr) throw new Error("작가 정보를 저장하지 못했어요.");

  const { error } = await admin.from("photographer_agreements").insert({
    photographer_id: me.photographer.id,
    profile_id: me.id,
    versions: PHOTOGRAPHER_AGREEMENT_VERSIONS,
    promo_consent: promoConsent,
    doc_records: docRecords,
    ip,
    user_agent: userAgent,
    agreed_at: now,
  });
  if (error) throw new Error("동의를 기록하지 못했어요. 다시 시도해주세요.");

  // 운영에 알린다 — 동의 시점이 곧 계약일이고, 사업자 유형에 따라 정산 준비가 갈린다
  await notifyOpsPhotographerAgreed({
    photographerId: me.photographer.id,
    displayName: me.photographer.displayName,
    legalName,
    businessType,
    businessNo,
    promoConsent,
    contractVersion: PHOTOGRAPHER_AGREEMENT_VERSIONS.contract,
  });

  await mpTrackServer("Agree Photographer Contract", me.id, {
    contract_version: PHOTOGRAPHER_AGREEMENT_VERSIONS.contract,
    business_type: businessType,
    promo_consent: promoConsent,
  });

  revalidatePath("/studio", "layout");
}

/**
 * 문서별 열람·동의 증적을 검사한다.
 *
 * 화면이 보내는 모양: {key: {openedAt, agreedAt}}. 여기서 버전을 붙여 굳힌다 —
 * 클라이언트가 보낸 버전을 믿으면 "낡은 문서를 읽고 새 버전에 동의한" 기록이 만들어진다.
 *
 * 넷 중 하나라도 빠지거나 시각이 이상하면 던진다. 조용히 null 로 넘기면 증적 없는
 * 동의가 쌓이고, 그건 나중에 복구할 방법이 없다.
 */
function parseDocRecords(raw: FormDataEntryValue | null): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw ?? ""));
  } catch {
    throw new Error("열람 기록이 없어요. 문서를 전문으로 읽고 다시 동의해주세요.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("열람 기록이 없어요. 문서를 전문으로 읽고 다시 동의해주세요.");
  }
  const src = parsed as Record<string, { openedAt?: unknown; agreedAt?: unknown }>;
  const out: Record<string, { openedAt: string; agreedAt: string; version: string }> = {};

  for (const key of DOC_ORDER) {
    const rec = src[key];
    const openedAt = typeof rec?.openedAt === "string" ? rec.openedAt : "";
    const agreedAt = typeof rec?.agreedAt === "string" ? rec.agreedAt : "";
    if (!openedAt || !agreedAt || Number.isNaN(Date.parse(openedAt)) || Number.isNaN(Date.parse(agreedAt))) {
      throw new Error("문서를 전문으로 읽어야 동의할 수 있어요.");
    }
    out[key] = {
      openedAt,
      agreedAt,
      // 버전은 **서버가 붙인다** — 지금 게시 중인 문서의 버전이 진실이다
      version: PHOTOGRAPHER_AGREEMENT_VERSIONS[key],
    };
  }
  return out;
}

"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { mpTrackServer } from "@/lib/mixpanel-server";

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

// 작가 신청 입력 검증 스키마
const ApplySchema = z.object({
  displayName: z.string().trim().min(1, "작가명을 입력하세요").max(40),
  bio: z.string().trim().max(500).optional().default(""),
  regions: z.string().optional().default(""),
  moodTags: z.string().optional().default(""),
});

export type ApplyState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

// 쉼표 구분 문자열 → 중복 제거된 배열
function parseList(raw: string): string[] {
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}

/**
 * 작가 신청 — photographers 행(status=pending) 생성.
 * 승인은 운영자가 별도로 처리한다.
 */
export async function applyAsPhotographer(
  _prev: ApplyState,
  formData: FormData
): Promise<ApplyState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  // 이미 신청한 작가인지 확인
  const { data: existing } = await supabase
    .from("photographers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (existing) return { error: "이미 작가 신청 내역이 있습니다." };

  // 입력 검증
  const parsed = ApplySchema.safeParse({
    displayName: formData.get("displayName"),
    bio: formData.get("bio"),
    regions: formData.get("regions"),
    moodTags: formData.get("moodTags"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { error: "입력값을 확인해주세요.", fieldErrors };
  }
  const v = parsed.data;

  // 작가명 중복 불가
  if (await isDisplayNameTaken(v.displayName, user.id)) {
    return { error: "이미 사용 중인 작가명이에요.", fieldErrors: { displayName: "이미 사용 중인 작가명이에요." } };
  }

  // 삽입 (RLS: profile_id = auth.uid() 만 허용)
  const { error } = await supabase.from("photographers").insert({
    profile_id: user.id,
    display_name: v.displayName,
    bio: v.bio,
    regions: parseList(v.regions),
    mood_tags: parseList(v.moodTags),
    status: "pending",
  });

  if (error) {
    // profile_id unique violation (이미 신청 — 위 가드와 동시성 보완)
    if (error.code === "23505") {
      return { error: "이미 작가 신청 내역이 있습니다." };
    }
    return { error: "신청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." };
  }

  redirect("/studio");
}

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
});

export type ProfileState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

// 작가 프로필 수정 (RLS: 본인 행만. status는 가드 트리거로 보호됨)
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

  // 새로고침(RSC 재렌더) 없이 저장 — 폼은 입력값을 그대로 유지하고 성공 표시만.
  // /studio·/studio/profile 은 인증 기반 동적 페이지라 다음 방문 시 자동으로 최신값 반영됨.
  return { ok: true };
}

// ─────────────────────────────────────────────
// 문의 수락 (리드 모델) — new → accepted(입금 대기). 관련 알림은 읽음 처리.
// ─────────────────────────────────────────────
export async function acceptInquiry(formData: FormData) {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가 권한이 필요합니다.");
  const id = String(formData.get("id"));

  const admin = createAdminClient();
  const { data: moved, error } = await admin
    .from("inquiries")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("photographer_id", me.photographer.id)
    .eq("status", "new")
    .select("id");
  if (error) throw new Error(error.message);

  // 실제 전이됐을 때만 — 작가(공급) 타임라인에 리드 해제 기록
  if (moved && moved.length > 0) {
    await mpTrackServer(
      "Unlock Lead",
      me.id,
      { inquiry_id: id, photographer_id: me.photographer.id },
      `Unlock Lead:${id}`,
    );
  }

  // 해당 문의의 '수락 대기' 알림 읽음 처리 (알림함에서 사라지게)
  await admin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", me.id)
    .eq("inquiry_id", id)
    .eq("type", "booking");

  revalidatePath("/studio");
  revalidatePath("/notifications");
}

// ─────────────────────────────────────────────
// 리드 다중 해제 신청 — 작가가 블러 리스트에서 여러 건 선택 → new → accepted(입금 대기).
// 선택분만 원자적으로 전이하고, 실제로 전이된 건수를 반환(이미 수락됐거나 타인 문의는 제외).
// ─────────────────────────────────────────────
export async function unlockInquiries(ids: string[]): Promise<{ ok: boolean; count: number }> {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가 권한이 필요합니다.");

  const clean = Array.from(new Set(ids.filter((v) => typeof v === "string" && v))).slice(0, 50);
  if (clean.length === 0) return { ok: true, count: 0 };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("inquiries")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("photographer_id", me.photographer.id) // 본인 문의만
    .eq("status", "new") // 아직 미수락인 것만
    .in("id", clean)
    .select("id");
  if (error) throw new Error(error.message);

  // 해제된 문의의 '수락 대기' 알림 읽음 처리
  const unlockedIds = (data ?? []).map((d) => d.id as string);
  if (unlockedIds.length > 0) {
    await admin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", me.id)
      .eq("type", "booking")
      .in("inquiry_id", unlockedIds);

    // 다건 해제 — 건별로 작가(공급) 타임라인에 기록
    for (const uid of unlockedIds) {
      await mpTrackServer(
        "Unlock Lead",
        me.id,
        { inquiry_id: uid, photographer_id: me.photographer.id, bulk: true },
        `Unlock Lead:${uid}`,
      );
    }
  }

  revalidatePath("/studio");
  revalidatePath("/notifications");
  return { ok: true, count: unlockedIds.length };
}

// 입금대기 취소 — 작가가 해제 신청(accepted)을 되돌린다. accepted → new(다시 받은 문의로).
// 입금 확인(confirmed) 이후에는 취소 불가(연락처가 이미 공개됨).
export async function cancelInquiryUnlock(id: string): Promise<{ ok: boolean }> {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가 권한이 필요합니다.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("inquiries")
    .update({ status: "new", accepted_at: null })
    .eq("id", id)
    .eq("photographer_id", me.photographer.id) // 본인 문의만
    .eq("status", "accepted"); // 입금대기만 — confirmed 는 되돌릴 수 없음
  if (error) throw new Error(error.message);

  revalidatePath("/studio");
  return { ok: true };
}

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

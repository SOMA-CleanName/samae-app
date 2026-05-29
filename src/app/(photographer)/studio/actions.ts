"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// 작가 신청 입력 검증 스키마
const ApplySchema = z.object({
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/, "핸들은 영문 소문자·숫자·_ 3~20자"),
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
    handle: formData.get("handle"),
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

  // 삽입 (RLS: profile_id = auth.uid() 만 허용)
  const { error } = await supabase.from("photographers").insert({
    profile_id: user.id,
    handle: v.handle,
    display_name: v.displayName,
    bio: v.bio,
    regions: parseList(v.regions),
    mood_tags: parseList(v.moodTags),
    status: "pending",
  });

  if (error) {
    // 핸들 중복 (unique violation)
    if (error.code === "23505") {
      return { error: "이미 사용 중인 핸들입니다.", fieldErrors: { handle: "중복된 핸들" } };
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
  priceFrom: z.coerce.number().int().min(0).max(100_000_000).optional().default(0),
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

  // 정산계좌 3필드 중 하나라도 있으면 객체로 저장 (민감정보)
  const settlement =
    v.bankName || v.accountNumber || v.accountHolder
      ? { bank: v.bankName, number: v.accountNumber, holder: v.accountHolder }
      : null;

  const { error } = await supabase
    .from("photographers")
    .update({
      display_name: v.displayName,
      bio: v.bio,
      regions: parseList(v.regions),
      mood_tags: parseList(v.moodTags),
      price_from_krw: v.priceFrom,
      settlement_account: settlement,
    })
    .eq("profile_id", user.id);

  if (error) return { error: "저장 중 오류가 발생했습니다." };

  revalidatePath("/studio/profile");
  revalidatePath("/studio");
  return { ok: true };
}

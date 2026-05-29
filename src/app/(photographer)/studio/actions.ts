"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
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

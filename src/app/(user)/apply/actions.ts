"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOpsNewApplication } from "@/lib/ops-alert";

export type ApplyLeadState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

const Schema = z.object({
  displayName: z.string().trim().min(1, "작가명을 입력해주세요.").max(40),
  portfolioUrl: z.string().trim().min(1, "포트폴리오 링크를 입력해주세요.").max(300),
  phone: z.string().trim().min(1, "전화번호를 입력해주세요.").max(30),
  bio: z.string().trim().max(500).optional(),
});

// 작가 신청(공개) — 비로그인 지원자가 남긴 정보를 저장하고 운영진에 알린다.
export async function submitPhotographerApplication(
  _prev: ApplyLeadState,
  formData: FormData,
): Promise<ApplyLeadState> {
  const parsed = Schema.safeParse({
    displayName: formData.get("displayName"),
    portfolioUrl: formData.get("portfolioUrl"),
    phone: formData.get("phone"),
    bio: formData.get("bio") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { error: "입력값을 확인해주세요.", fieldErrors };
  }
  const v = parsed.data;
  const bio = v.bio && v.bio.length > 0 ? v.bio : null;

  // 공개 폼이므로 service_role 로 삽입 (RLS: 운영자만 조회)
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("photographer_applications")
    .insert({
      display_name: v.displayName,
      portfolio_url: v.portfolioUrl,
      phone: v.phone,
      bio,
    })
    .select("id")
    .single();
  if (error) {
    return { error: "신청 접수에 실패했어요. 잠시 후 다시 시도해주세요." };
  }

  await notifyOpsNewApplication({
    applicationId: data.id as string,
    displayName: v.displayName,
    portfolioUrl: v.portfolioUrl,
    phone: v.phone,
    bio,
  });

  return { ok: true };
}

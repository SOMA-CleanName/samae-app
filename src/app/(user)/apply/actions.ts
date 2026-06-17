"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
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

// 작가 신청 — 로그인 사용자의 신청을 계정(profile_id)에 연결해 저장하고 운영진에 알린다.
export async function submitPhotographerApplication(
  _prev: ApplyLeadState,
  formData: FormData,
): Promise<ApplyLeadState> {
  // 로그인 필수
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요. 로그인 후 다시 신청해주세요." };

  // 이미 작가면 신청 불가
  const { data: existingPh } = await supabase
    .from("photographers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (existingPh) return { error: "이미 작가로 등록되어 있어요." };

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

  // service_role 로 삽입 (RLS: 운영자만 조회). 본인 계정(profile_id) 에 연결.
  const admin = createAdminClient();

  // 처리 전(new·contacted) 신청이 이미 있으면 중복 접수 막기
  const { data: open } = await admin
    .from("photographer_applications")
    .select("id")
    .eq("profile_id", user.id)
    .in("status", ["new", "contacted"])
    .maybeSingle();
  if (open) return { error: "이미 접수된 신청이 있어요. 승인까지 기다려주세요." };

  const { data, error } = await admin
    .from("photographer_applications")
    .insert({
      profile_id: user.id,
      display_name: v.displayName,
      portfolio_url: v.portfolioUrl,
      phone: v.phone,
      bio,
    })
    .select("id")
    .single();
  if (error) {
    // 부분 유니크(uniq_application_open_profile) 위반 등
    if (error.code === "23505") return { error: "이미 접수된 신청이 있어요. 승인까지 기다려주세요." };
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

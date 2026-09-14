"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOpsNewApplication } from "@/lib/ops-alert";
import { mpTrackServer } from "@/lib/mixpanel-server";
// 검증은 schema.ts 한 곳에 있다 — /dev/flow(샌드박스)가 같은 것을 쓴다.
// "use server" 파일은 비동기 함수만 내보낼 수 있어서 여기 두면 클라이언트가 못 가져간다.
import { applyFieldErrors, parseApplyForm } from "./schema";

export type { ApplyLeadState } from "./schema";
import type { ApplyLeadState } from "./schema";

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

  const parsed = parseApplyForm(formData);
  if (!parsed.success) {
    return { error: "입력값을 확인해주세요.", fieldErrors: applyFieldErrors(parsed.error.issues) };
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

  // 작가 신청 — 공급 온보딩 퍼널 진입. (PII 제외: 이름·전화·링크 미전송)
  await mpTrackServer(
    "Apply Photographer",
    user.id,
    { application_id: data.id },
    `Apply Photographer:${data.id}`,
  );

  return { ok: true };
}

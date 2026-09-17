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

  // service_role 로 삽입 (RLS: 운영자만 조회). 본인 계정(profile_id) 에 연결.
  const admin = createAdminClient();

  // ⚠️ **검증보다 먼저** 인증된 번호를 채운다.
  //
  //    이미 번호가 있으면 화면은 입력란을 아예 그리지 않는다(ApplyLeadForm) — hidden 도
  //    없다. 그래서 formData 에 phone 이 없고, 검증을 먼저 돌리면 "전화번호를 입력해주세요"
  //    로 떨어진다. 화면에는 이유가 안 보이는 "입력값을 확인해주세요" 만 뜨고 입력칸이
  //    초기화된다(2026-09-16 신고: 포폴 링크가 자꾸 비워짐).
  //
  //    **가입 때 번호를 받게 된 뒤로는 신청이 통째로 막혀 있었다.** 순서 하나 때문이다.
  //
  //    채워 넣는 김에 값도 이걸로 고정한다 — 화면이 보내는 번호는 얼마든지 고쳐 보낼 수
  //    있지만, 인증을 거친 profiles.phone 은 우리가 확인한 값이다.
  const { data: profile } = await admin
    .from("profiles")
    .select("phone")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.phone) formData.set("phone", profile.phone);

  const parsed = parseApplyForm(formData);
  if (!parsed.success) {
    return { error: "입력값을 확인해주세요.", fieldErrors: applyFieldErrors(parsed.error.issues) };
  }
  const v = parsed.data;
  const bio = v.bio && v.bio.length > 0 ? v.bio : null;


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

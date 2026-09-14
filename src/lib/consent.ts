import "server-only";

// 동의 기록 — 회원약관 동의와 작가 입점 계약 동의를 읽고 쓰는 곳.
//
// 회원: profiles.terms_agreed_at / terms_version. 없으면 /signup/consent 로 보낸다 (auth/callback).
// 작가: photographer_agreements 의 최신 행. versions 가 현재 버전과 다르면 스튜디오에 동의 화면을 띄운다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { agreementIsCurrent, TERMS_VERSION } from "@/lib/policy-version";

// 버전 묶음과 비교 규칙은 policy-version.ts 에 있다 — 클라이언트 컴포넌트(AgreeGate,
// /dev/flow)도 가져다 써야 해서 server-only 인 이 파일에 둘 수 없었다.
// 기존 import 경로가 깨지지 않게 여기서 그대로 다시 내보낸다.
export {
  PHOTOGRAPHER_AGREEMENT_VERSIONS,
  agreementIsCurrent,
  type AgreementVersions,
} from "@/lib/policy-version";

/** 회원약관 동의가 없는 계정인가 — 조회 실패 시 false (로그인 흐름을 막지 않는다) */
export async function needsTermsConsent(supabase: SupabaseClient): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase
      .from("profiles")
      .select("terms_agreed_at")
      .eq("id", user.id)
      .maybeSingle();
    return !data?.terms_agreed_at;
  } catch {
    return false;
  }
}

/** 회원약관·개인정보처리방침 동의를 기록한다. 이미 있으면 덮어쓰지 않는다 */
export async function recordTermsConsent(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ terms_agreed_at: new Date().toISOString(), terms_version: TERMS_VERSION })
    .eq("id", userId)
    .is("terms_agreed_at", null);
}

/** 이 작가가 현재 버전의 입점 계약에 동의했는가 */
export async function hasCurrentPhotographerAgreement(
  supabase: SupabaseClient,
  photographerId: string
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("photographer_agreements")
      .select("versions")
      .eq("photographer_id", photographerId)
      .order("agreed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return agreementIsCurrent(data?.versions);
  } catch {
    // 조회가 깨지면 동의 화면을 띄우는 쪽이 안전하다 — 계약 없이 활동하는 것보다 낫다
    return false;
  }
}

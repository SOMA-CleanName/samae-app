import "server-only";

// 동의 기록 — 회원약관 동의와 작가 입점 동의를 읽고 쓰는 곳.
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
      .select("terms_agreed_at, terms_version")
      .eq("id", user.id)
      .maybeSingle();
    return !termsConsentIsCurrent(data);
  } catch {
    return false;
  }
}

/**
 * 이 회원의 동의가 **현재 버전**인가.
 *
 * ⚠️ 전에는 `terms_agreed_at` 이 있는지만 봤다. 그러면 **약관을 개정해도 기존 회원은
 *    재동의하지 않는다** — 바뀐 내용을 아무도 안 보고 넘어가고, 그러면 개정한 의미가 없다.
 *    작가 입점 동의는 문서 버전을 다 비교하는데(agreementIsCurrent) 회원 약관만 안 하고
 *    있었다. 그 비대칭을 없앤다.
 *
 * 버전이 비어 있는 옛 기록도 "현재 아님" 으로 본다 — 어느 문안에 동의했는지 알 수 없는
 * 기록은 있다고 칠 수 없다.
 */
export function termsConsentIsCurrent(
  profile: { terms_agreed_at?: string | null; terms_version?: string | null } | null | undefined
): boolean {
  if (!profile?.terms_agreed_at) return false;
  return profile.terms_version === TERMS_VERSION;
}

/**
 * 회원약관·개인정보처리방침 동의를 기록한다.
 *
 * ⚠️ 전에는 `.is("terms_agreed_at", null)` 로 **이미 있으면 덮어쓰지 않았다.** 버전 비교를
 *    켜면 그 가드가 곧바로 사고가 된다 — 재동의를 받아도 기록이 안 남아서 매 로그인마다
 *    같은 화면을 다시 보게 된다. 지금은 조건 없이 현재 버전으로 갱신한다.
 *
 * 📌 갱신이므로 **이전 동의 시각은 남지 않는다.** 버전별 이력이 필요해지면
 *    photographer_agreements 처럼 행을 쌓는 표가 있어야 한다 — 지금은 두 칸뿐이다.
 */
export async function recordTermsConsent(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ terms_agreed_at: new Date().toISOString(), terms_version: TERMS_VERSION })
    .eq("id", userId);
}

/** 이 작가가 현재 버전의 입점 문서 묶음에 동의했는가 */
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

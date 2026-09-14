import "server-only";

// 동의 기록 — 회원약관 동의와 작가 입점 계약 동의를 읽고 쓰는 곳.
//
// 회원: profiles.terms_agreed_at / terms_version. 없으면 /signup/consent 로 보낸다 (auth/callback).
// 작가: photographer_agreements 의 최신 행. versions 가 현재 버전과 다르면 스튜디오에 동의 화면을 띄운다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FEE_POLICY_VERSION,
  PHOTOGRAPHER_CONTRACT_VERSION,
  PHOTOGRAPHER_TERMS_VERSION,
  REFUND_POLICY_VERSION,
  TERMS_VERSION,
} from "@/lib/policy-version";

/** 작가가 동의해야 하는 문서 묶음의 현재 버전 */
export const PHOTOGRAPHER_AGREEMENT_VERSIONS = {
  terms: PHOTOGRAPHER_TERMS_VERSION,
  fee: FEE_POLICY_VERSION,
  refund: REFUND_POLICY_VERSION,
  contract: PHOTOGRAPHER_CONTRACT_VERSION,
} as const;

export type AgreementVersions = { terms: string; fee: string; refund: string; contract: string };

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

/** 최신 입점 동의가 현재 버전과 같은가 */
export function agreementIsCurrent(versions: unknown): boolean {
  if (!versions || typeof versions !== "object") return false;
  const v = versions as Partial<AgreementVersions>;
  return (
    v.terms === PHOTOGRAPHER_AGREEMENT_VERSIONS.terms &&
    v.fee === PHOTOGRAPHER_AGREEMENT_VERSIONS.fee &&
    v.refund === PHOTOGRAPHER_AGREEMENT_VERSIONS.refund &&
    v.contract === PHOTOGRAPHER_AGREEMENT_VERSIONS.contract
  );
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

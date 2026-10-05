// 회원 약관 동의가 지금 버전과 맞는가 — 어드민 회원 목록이 쓴다.
//
// `termsConsentIsCurrent()`(lib/consent)가 이미 있지만 **참/거짓뿐**이고 server-only 라
// 테스트가 못 돈다. 어드민이 필요한 건 셋이다 — 재동의를 요청해 둔 상태에서 "누가 아직인가"
// 를 세려면 **한 번도 동의 안 한 사람**과 **옛 버전에 동의한 사람**이 갈려야 한다.
// 보내는 말이 다르기 때문이다.
//
// 작가 쪽(lib/agreement-status)과 같은 모양으로 맞춰 둔다 — 두 목록의 배지가 같은 말을
// 써야 운영자가 헷갈리지 않는다.

import { TERMS_VERSION } from "./policy-version";

export type TermsState = "current" | "outdated" | "none";

export type TermsStatus = {
  state: TermsState;
  label: string;
  tone: "success" | "warning" | "danger";
};

const LABEL: Record<TermsState, string> = {
  current: "최신",
  outdated: "구버전",
  none: "미동의",
};
const TONE: Record<TermsState, TermsStatus["tone"]> = {
  current: "success",
  outdated: "warning",
  none: "danger",
};

/**
 * 동의 시각이 없으면 미동의다. **버전만 맞고 시각이 없는 경우도 미동의로 본다** —
 * 시각이 없으면 "언제 동의했는가" 에 답할 수 없고, 그 답이 없는 동의는 다툼에서 못 쓴다.
 *
 * 버전이 비어 있는 옛 기록은 `outdated` 다. 동의는 했으니 `none` 이 아니고, 지금 버전과
 * 같다고 말할 근거도 없다.
 */
export function termsStatus(
  profile: { terms_agreed_at?: string | null; terms_version?: string | null } | null | undefined
): TermsStatus {
  if (!profile?.terms_agreed_at) {
    return { state: "none", label: LABEL.none, tone: TONE.none };
  }
  const state: TermsState = profile.terms_version === TERMS_VERSION ? "current" : "outdated";
  return { state, label: LABEL[state], tone: TONE[state] };
}

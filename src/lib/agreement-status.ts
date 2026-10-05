// 작가 입점 동의가 지금 버전과 맞는가 — 어드민 목록·상세가 같은 답을 써야 한다.
//
// `agreementIsCurrent()` 는 버전 묶음 하나를 보고 참/거짓만 낸다. 어드민이 필요한 건
// **행 여러 개 중 최신을 고르고, 셋 중 어디에 속하는지**다. 재동의를 요청해 둔 상태에서
// "누가 갱신했나" 를 세려면 `없음` 과 `옛 버전` 이 갈려야 한다 — 둘 다 재동의 대상이지만
// 전자는 한 번도 동의한 적이 없는 사람이라 보내는 말이 다르다.
//
// `photographer_agreements` 는 **행이 쌓이는 표**다(0112). 한 작가가 여러 번 동의하므로
// 최신 한 건만 보고 판정하고, 이력은 상세에서 따로 보여준다.
//
// server-only 를 들이지 않는다 — 테스트가 못 돈다.

import { agreementIsCurrent } from "./policy-version";

/** 어드민 화면이 쓰는 최소 모양. 실제 행에는 ip·user_agent·doc_records 가 더 있다. */
export type AgreementRow = {
  versions: unknown;
  agreed_at: string;
};

export type AgreementState = "current" | "outdated" | "none";

export type AgreementStatus = {
  state: AgreementState;
  /** 판정 근거가 된 행. 한 번도 동의하지 않았으면 null */
  latest: AgreementRow | null;
  /** 배지에 그대로 쓰는 말 */
  label: string;
};

const LABEL: Record<AgreementState, string> = {
  current: "최신",
  outdated: "구버전",
  none: "미동의",
};

/**
 * 한 작가의 동의 행들에서 현재 상태를 판정한다.
 *
 * 최신은 `agreed_at` 이 가장 늦은 행이다. 표에 인덱스가 `agreed_at desc` 로 걸려 있지만
 * 여기서 **순서를 가정하지 않는다** — 호출부가 정렬을 바꾸면 조용히 틀린 답이 나온다.
 * 날짜가 깨진 행은 후보에서 뺀다(빈 문자열·null 이 최신으로 뽑히는 걸 막는다).
 */
export function agreementStatus(rows: AgreementRow[] | null | undefined): AgreementStatus {
  let latest: AgreementRow | null = null;
  let latestMs = -Infinity;
  for (const r of rows ?? []) {
    const ms = new Date(r?.agreed_at ?? "").getTime();
    if (isNaN(ms)) continue;
    if (ms > latestMs) {
      latestMs = ms;
      latest = r;
    }
  }
  if (!latest) return { state: "none", latest: null, label: LABEL.none };
  const state: AgreementState = agreementIsCurrent(latest.versions) ? "current" : "outdated";
  return { state, latest, label: LABEL[state] };
}

/** 작가별로 묶는다 — 목록이 N명을 한 번에 세야 해서 행을 한 번만 훑는다. */
export function groupAgreementsByPhotographer<T extends AgreementRow & { photographer_id: string }>(
  rows: T[] | null | undefined
): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows ?? []) {
    const arr = m.get(r.photographer_id);
    if (arr) arr.push(r);
    else m.set(r.photographer_id, [r]);
  }
  return m;
}

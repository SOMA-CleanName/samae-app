// 무리(D3) 묶기 검수의 순수 로직. 파일 입출력은 mood-cluster-data.ts 에 있다 (docs/40 §16).
// 무리는 "거의 같은" 묶음끼리다(깜박이는 · 껌벅이는). 묶음은 없애지 않는다 — 틀리면 무리에서 빼면 된다.
// 721곳을 다 보기엔 많아서 에이전트가 1차로 가른다 — 무리(group) · 아님(keep) · 애매함(unsure).
// 사람은 애매함만 보고, 나머지는 훑다가 뒤집는다. 사람 판정이 있으면 늘 그것이 이긴다.

/** hit: 글자 규칙에 걸린 검색어 — 이 후보가 왜 모였는지 보여 준다 */
export type ClusterTerm = { term: string; gloss: string; hit?: boolean };
export type ClusterGroup = { head: string; label: string; axes: string[]; usage: string; terms: ClusterTerm[] };

export type ClusterCase = {
  id: string;
  /** root: 같은 뿌리·소리 변형 / similar: 서로 고른 이웃 중 유사도가 아주 높은 쌍 */
  kind: "root" | "similar";
  reason: string;
  groups: ClusterGroup[];
  ai?: { verdict: "group" | "keep" | "unsure"; members?: string[]; why: string };
};

export type ClusterVerdict = "group" | "keep";
/**
 * group: members 를 한 무리로. keep: 묶지 않는다.
 * 무리에는 대표가 없다 — "이 묶음들은 거의 같다" 는 관계일 뿐이다(사람 결정, 2026-09-22).
 */
export type ClusterReview = { id: string; verdict: ClusterVerdict; members?: string[]; at: string };

export function latestReviews(reviews: ClusterReview[]) {
  const last = new Map<string, ClusterReview>();
  for (const review of reviews) last.set(review.id, review);
  return last;
}

/** 화면에서 고른 묶음 → 무리. 둘 이상이어야 무리다. 후보에 없는 묶음은 버린다 — 폼 값은 믿지 않는다. */
export function clusterFrom(groups: ClusterGroup[], picked: string[]) {
  const members = groups.map((g) => g.head).filter((h) => picked.includes(h));
  return members.length < 2 ? null : { members };
}

/** 지금 이 후보는 어떻게 정해져 있나 — 사람 판정이 있으면 그것, 없으면 에이전트 판정(애매함은 미정). */
export function effective(c: ClusterCase, review?: ClusterReview) {
  if (review) return { by: "me" as const, verdict: review.verdict, members: review.members ?? [] };
  if (c.ai && c.ai.verdict !== "unsure") {
    return { by: "ai" as const, verdict: c.ai.verdict, members: c.ai.members ?? [] };
  }
  return { by: "none" as const, verdict: undefined, members: [] as string[] };
}

/** unsure: 사람이 볼 것(에이전트가 애매하다고 넘겼고 아직 안 정함) / ai-group · ai-keep: 에이전트가 정한 것 / mine: 내가 정한 것 */
export const FILTERS = ["unsure", "ai-group", "ai-keep", "mine", "all"] as const;
export type Filter = (typeof FILTERS)[number];

function bucket(c: ClusterCase, review?: ClusterReview): Exclude<Filter, "all"> {
  if (review) return "mine";
  if (c.ai?.verdict === "group") return "ai-group";
  if (c.ai?.verdict === "keep") return "ai-keep";
  return "unsure";                               // 애매함, 또는 에이전트 판정이 아직 없는 것
}

export function selectCases(cases: ClusterCase[], reviews: Map<string, ClusterReview>, filter: Filter, kind: string, q = "") {
  const needle = q.trim();
  return cases.filter((c) => {
    if (filter !== "all" && bucket(c, reviews.get(c.id)) !== filter) return false;
    if (kind && c.kind !== kind) return false;
    if (!needle) return true;
    return c.reason.includes(needle) || c.groups.some((g) => g.label.includes(needle) || g.terms.some((t) => t.term.includes(needle)));
  });
}

export function counts(cases: ClusterCase[], reviews: Map<string, ClusterReview>) {
  const tally: Record<Filter, number> = { unsure: 0, "ai-group": 0, "ai-keep": 0, mine: 0, all: cases.length };
  for (const c of cases) tally[bucket(c, reviews.get(c.id))] += 1;
  return tally;
}

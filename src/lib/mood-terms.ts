// 검색어 정리 화면의 순수 로직. 파일 입출력은 mood-terms-data.ts 에 있다.

export type TermRow = {
  head: string;
  axes: string[];
  usage: string;
  terms: string[];
  /** 버린 낱말 → 흡수한 검색어. 사라지는 게 아니라 검색 별칭으로 남는다. */
  aliases: Record<string, string>;
  /** 모델이 지어내서 버린 낱말. 비어 있어야 정상이다. */
  made_up: string[];
  /** 꼴이 수상한 것 — 부사(멍하니)나 사전형이 남았거나 한 글자짜리. */
  odd: string[];
};

export type TermsBundle = {
  rows: TermRow[];
  terms: number;
  aliases: number;
  /** 서로 다른 묶음이 같은 검색어로 끝난 것. 뭉쳐야 할 후보다. */
  collisions: Record<string, string[]>;
};

/** 사람이 손댄 것. 자동 생성분과 따로 둔다 — 다시 만들어도 살아남아야 한다 (§9-5 의 교훈). */
export type TermAction = "rename" | "drop" | "add";
export type TermEdit = {
  head: string;
  action: TermAction;
  term: string;
  to?: string;      // rename 일 때 바꿀 꼴
  note?: string;
  at: string;
};

/**
 * 자동분에 사람 수정분을 덮어 최종 검색어를 만든다.
 * 같은 낱말을 여러 번 고쳤으면 마지막 것만 산다.
 */
export function resolveTerms(bundle: TermsBundle, edits: TermEdit[]) {
  const byHead = new Map<string, string[]>(bundle.rows.map((r) => [r.head, [...r.terms]]));
  for (const edit of edits) {
    const terms = byHead.get(edit.head);
    if (!terms) continue;                  // 번들에 없는 묶음 — 그래프가 바뀐 뒤의 옛 기록
    const at = terms.indexOf(edit.term);
    if (edit.action === "drop") {
      if (at >= 0) terms.splice(at, 1);
    } else if (edit.action === "add") {
      if (at < 0) terms.push(edit.term);
    } else if (edit.action === "rename" && edit.to) {
      if (at >= 0) terms[at] = edit.to;
      else if (!terms.includes(edit.to)) terms.push(edit.to);
    }
  }
  return byHead;
}

/** 한 묶음이 사람 손을 탔는가. 검수 진행도를 이걸로 잰다. */
export function touched(edits: TermEdit[]) {
  return new Set(edits.map((e) => e.head));
}

export type Filter = "all" | "odd" | "replaced" | "many" | "made_up" | "done" | "todo";

export const FILTERS: { key: Filter; label: string }[] = [
  { key: "odd", label: "꼴이 수상" },
  { key: "replaced", label: "대표 바뀜" },
  { key: "many", label: "여럿으로 갈림" },
  { key: "made_up", label: "지어냄" },
  { key: "todo", label: "안 본 것" },
  { key: "done", label: "손댄 것" },
  { key: "all", label: "전체" },
];

function matches(row: TermRow, filter: Filter, seen: Set<string>) {
  switch (filter) {
    case "odd": return row.odd.length > 0;
    case "replaced": return row.head in row.aliases;
    case "many": return row.terms.length >= 3;
    case "made_up": return row.made_up.length > 0;
    case "done": return seen.has(row.head);
    case "todo": return !seen.has(row.head);
    default: return true;
  }
}

/** 검색은 대표·검색어·별칭·용례 어디에 걸려도 된다 — 어느 이름으로 기억하든 찾아야 한다. */
function hit(row: TermRow, needle: string) {
  return row.head.includes(needle)
    || row.usage.includes(needle)
    || row.terms.some((t) => t.includes(needle))
    || Object.keys(row.aliases).some((w) => w.includes(needle));
}

export function selectRows(
  rows: TermRow[],
  { filter, q, axis, edits }: { filter: Filter; q: string; axis: string; edits: TermEdit[] },
) {
  const seen = touched(edits);
  const needle = q.trim();
  return rows.filter((row) =>
    matches(row, filter, seen)
    && (!axis || row.axes.includes(axis))
    && (!needle || hit(row, needle)));
}

export function counts(rows: TermRow[], edits: TermEdit[]) {
  const seen = touched(edits);
  return Object.fromEntries(
    FILTERS.map(({ key }) => [key, rows.filter((r) => matches(r, key, seen)).length]),
  ) as Record<Filter, number>;
}

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
  /** 꼴이 수상한 것. 검수가 끝나 번들에 굳힌 뒤로는 비어 있다(bake_mood_terms.py). */
  odd: string[];
  /** 사전 거르기(docs/40 §17-3)로 새로 들어온 날. 한 낱말 = 한 묶음이고 아직 축이 없다. */
  added?: string;
  /** false 면 판정이 애매했던 것 — 나중에 사람이 본다 */
  sure?: boolean;
};

export type TermsBundle = {
  rows: TermRow[];
  terms: number;
  aliases: number;
  /** 서로 다른 묶음이 같은 검색어로 끝난 것. 뭉쳐야 할 후보다. */
  collisions: Record<string, string[]>;
};

/**
 * 화면에서 고친 것. 번들과 따로 쌓였다가 bake_mood_terms.py 로 번들에 굳힌다 —
 * 굳힌 뒤에는 기록을 비운다. 무엇을 왜 고쳤는지는 남기지 않는다(2026-09-19 결정).
 */
export type TermAction = "rename" | "drop" | "add";
export type TermEdit = {
  head: string;
  action: TermAction;
  term: string;
  to?: string;      // rename 일 때 바꿀 꼴
  at: string;
};

/**
 * 번들에 아직 굳히지 않은 수정을 덮어 최종 검색어를 만든다.
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

/**
 * 묶음을 부를 이름 — 사전형(뚜렷하다)이 아니라 검색 꼴(뚜렷한)이다.
 * 2차 검토(2026-09-19)부터 첫 검색어가 대표다: 축에 비춰 가장 넓고 중심인 말을 맨 앞에 뒀다
 * (글썽이는 이 아니라 슬픈). 검색어가 하나도 없으면 사전형으로 돌아간다 — 이름 없는 카드는 안 된다.
 */
export function representative(row: TermRow, terms: string[]) {
  return terms[0] ?? row.head;
}

/** 전체 축을 한꺼번에 볼 때 쓰는 값. 기본은 축 하나씩 나눠 본다. */
export const ALL_AXES = "전체";
/** 축이 아직 없는 묶음(새로 들어온 낱말)만 볼 때 쓰는 값 */
export const NO_AXIS = "축 없음";

export type RowFilter = {
  q: string;
  /** 축 이름, 또는 ALL_AXES */
  axis: string;
  /** 축이 두 개 이상 붙은 묶음만 */
  multi?: boolean;
  /** 대표 → 영어 프롬프트. 축 배정에 쓴 문장으로도 찾을 수 있게 한다. */
  prompts?: Map<string, string[]>;
};

/** 검색은 대표·검색어·별칭·용례·영어 프롬프트 어디에 걸려도 된다 — 어느 이름으로 기억하든 찾아야 한다. */
function hit(row: TermRow, needle: string, prompts: string[]) {
  const lower = needle.toLowerCase();
  return row.head.includes(needle)
    || row.usage.includes(needle)
    || row.terms.some((t) => t.includes(needle))
    || Object.keys(row.aliases).some((w) => w.includes(needle))
    || prompts.some((p) => p.toLowerCase().includes(lower));
}

export function selectRows(rows: TermRow[], { q, axis, multi = false, prompts }: RowFilter) {
  const needle = q.trim();
  return rows.filter((row) =>
    (axis === ALL_AXES || !axis || (axis === NO_AXIS ? row.axes.length === 0 : row.axes.includes(axis)))
    && (!multi || row.axes.length > 1)
    && (!needle || hit(row, needle, prompts?.get(row.head) ?? [])));
}

/**
 * 축마다 묶음 수와 서로 다른 검색어 수. 한 묶음이 여러 축에 들어가므로
 * 축끼리 더하면 전체보다 크다 — 축은 대등하다 (docs/40 §10-1).
 */
export function axisTally(rows: TermRow[], final: Map<string, string[]>) {
  const tally = new Map<string, { groups: number; terms: Set<string> }>();
  for (const row of rows) {
    for (const axis of row.axes) {
      const entry = tally.get(axis) ?? { groups: 0, terms: new Set<string>() };
      entry.groups += 1;
      for (const term of final.get(row.head) ?? []) entry.terms.add(term);
      tally.set(axis, entry);
    }
  }
  return new Map([...tally].map(([axis, { groups, terms }]) => [axis, { groups, terms: terms.size }]));
}

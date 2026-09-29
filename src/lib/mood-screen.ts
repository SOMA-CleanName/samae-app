// 1차 전처리 무드 목록(docs/40 §17-3)의 순수 로직. 파일 입출력은 mood-screen-data.ts 에 있다.

/**
 * old: 옛 판정 그대로 · flipped: 새 기준으로 뒤집음(가치 판단 · 꾸밈 · 잘못 빠진 것) · new: 우리말샘까지 거른 새 판정 ·
 * added: 검증 후보 · 사전 밖 추가 후보 · 기존 사진 태그 중 판정에서 빠졌던 것을 사람 결정으로 넣은 것
 */
export type ScreenHow = "old" | "flipped" | "new" | "added";

export type ScreenWord = {
  w: string;
  axes: string[];
  how: ScreenHow;
  sure: boolean;
  why: string;
  /** 띄어쓰기만 다른 표기(파스텔 톤 ← 파스텔톤). 검색은 이것으로도 된다 */
  alt?: string[];
  /** added 일 때 어디서 왔나 */
  src?: string[];
  /** 축 판정이 애매했다(뜻풀이가 어근뿐 · 사진과 먼 추상어 · 제목) — 나중에 사람이 본다 */
  axis_unsure?: boolean;
};

export type ScreenList = {
  words: ScreenWord[];
  counts: { all: number; unsure: number; no_axis: number; axis_unsure?: number } & Partial<Record<ScreenHow, number>>;
};

/** 축이 아직 없는 낱말만 볼 때 쓰는 값 — 새로 들어온 낱말은 축 배정 전이다 */
export const NO_AXIS = "축 없음";

export const HOW_LABEL: Record<ScreenHow, string> = { old: "옛 판정", flipped: "새 기준으로 바꿈", new: "새 판정", added: "추가" };

/** 검색은 낱말 · 띄어쓰기만 다른 표기 · 판정 근거 어디에 걸려도 된다. 축은 하나 골라 좁히거나 "축 없음" 만 본다. */
export function selectScreenWords(words: readonly ScreenWord[], { q, axis }: { q: string; axis: string }) {
  const needle = q.trim();
  return words.filter((word) =>
    (!axis || (axis === NO_AXIS ? word.axes.length === 0 : word.axes.includes(axis)))
    && (!needle || word.w.includes(needle) || word.why.includes(needle) || (word.alt ?? []).some((a) => a.includes(needle))));
}

// 축 배정 화면의 순수 로직. 파일 입출력은 mood-axes-data.ts 에 있고
// 여기는 서버 전용 표시가 없어 테스트에서 그대로 부를 수 있다.

export type AxisGroup = {
  head: string;
  axes: string[];
  members: string[];
  prompts: string[];
  usage: string;
};

export type AxisTally = { heads: number; words: number };

export type AxisBundle = {
  version: string;
  compiled_at: string;
  heads: number;
  words: number;
  per_axis: Record<string, AxisTally>;
  groups: AxisGroup[];
};

/** 축 11개. 순서는 문서 36 §8 과 같다 — 화면에서도 같은 차례로 보여야 헷갈리지 않는다. */
export const AXES = [
  "감정", "관계", "스타일", "온도", "계절·날씨", "빛", "색감", "질감", "에너지", "공간", "시간대",
] as const;

/** 축마다 다른 색을 준다. Tailwind 는 클래스 문자열을 통째로 훑으므로 조합해 만들지 않는다. */
export const AXIS_TONE: Record<string, string> = {
  "감정": "border-rose-400 bg-rose-500/10 text-rose-700",
  "관계": "border-pink-400 bg-pink-500/10 text-pink-700",
  "스타일": "border-violet-400 bg-violet-500/10 text-violet-700",
  "온도": "border-orange-400 bg-orange-500/10 text-orange-700",
  "계절·날씨": "border-emerald-400 bg-emerald-500/10 text-emerald-700",
  "빛": "border-amber-400 bg-amber-500/10 text-amber-700",
  "색감": "border-fuchsia-400 bg-fuchsia-500/10 text-fuchsia-700",
  "질감": "border-stone-400 bg-stone-500/10 text-stone-700",
  "에너지": "border-red-400 bg-red-500/10 text-red-700",
  "공간": "border-sky-400 bg-sky-500/10 text-sky-700",
  "시간대": "border-indigo-400 bg-indigo-500/10 text-indigo-700",
};

export const AXIS_BAR: Record<string, string> = {
  "감정": "bg-rose-400", "관계": "bg-pink-400", "스타일": "bg-violet-400",
  "온도": "bg-orange-400", "계절·날씨": "bg-emerald-400", "빛": "bg-amber-400",
  "색감": "bg-fuchsia-400", "질감": "bg-stone-400", "에너지": "bg-red-400",
  "공간": "bg-sky-400", "시간대": "bg-indigo-400",
};

/** 축은 대등하다. 어느 축을 골라도 그 축이 붙은 묶음은 모두 나온다 (docs/36 §10-1). */
export type Filter = { axis: string; q: string; multi: boolean };

export function selectGroups(groups: AxisGroup[], filter: Filter) {
  const q = filter.q.trim();
  const needle = q.toLowerCase();
  return groups.filter((group) => {
    if (filter.axis && !group.axes.includes(filter.axis)) return false;
    if (filter.multi && group.axes.length < 2) return false;
    if (!q) return true;
    return group.head.includes(q)
      || group.members.some((member) => member.includes(q))
      || group.prompts.some((prompt) => prompt.toLowerCase().includes(needle));
  });
}

/** 낱말 수는 대표 + 식구다. 대표만 세면 5,176 이 아니라 2,647 이 나온다. */
export const wordCount = (groups: AxisGroup[]) =>
  groups.reduce((total, group) => total + 1 + group.members.length, 0);

/** 축을 몇 개씩 받았나. 다축이 실제로 쓰였는지가 여기서 드러난다 (§10-6). */
export function axisSpread(groups: AxisGroup[]) {
  const spread = new Map<number, number>();
  for (const group of groups) spread.set(group.axes.length, (spread.get(group.axes.length) ?? 0) + 1);
  return [...spread.entries()].sort(([a], [b]) => a - b);
}

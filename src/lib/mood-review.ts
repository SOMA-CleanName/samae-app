// 무드 그래프 검수 화면의 순수 로직. 파일 입출력은 mood-review-data.ts 에 있고
// 여기는 서버 전용 표시가 없어 테스트에서 그대로 부를 수 있다.

export type Group = {
  head: string;
  level: number;
  members: string[];
  prompts: string[];
  picked_by?: string;
};

// status 가 없는 기록은 메모만 남긴 것이다 — 아직 판정하지 않았지만
// 나중에 다시 볼 이유를 적어 둔 묶음. 진행 수에는 세지 않는다.
export type Verdict = {
  status?: "ok" | "head" | "split" | "drop";
  head?: string;
  note?: string;
  at: string;
};

/** 판정한 것으로 치는 기준. 메모만 있는 기록은 아직 안 본 것이다. */
export const isJudged = (verdict?: Verdict) => Boolean(verdict?.status);

export type Sense = { label: string; pos: string; level: number; senses: string[] };

export const LEVELS = ["초급", "중급", "고급", "없음"];
export const levelLabel = (level: number) => LEVELS[level] ?? "없음";

export type Filter = { q: string; size: string; state: string };

/**
 * 검수는 식구가 많은 묶음부터 본다 — 사용자 눈에 먼저 닿고, 틀리면 티가 크다.
 * 크기 구간은 서로 겹치지 않는다: 한 묶음이 두 탭에 동시에 나오면 센 개수를 믿을 수 없다.
 */
export function selectGroups(groups: Group[], verdicts: Record<string, Verdict>, filter: Filter) {
  const q = filter.q.trim();
  const [min, max] = filter.size === "solo" ? [0, 0]
    : filter.size === "mid" ? [1, 4]
    : filter.size === "big" ? [5, Infinity]
    : [0, Infinity];
  return groups.filter((group) => {
    const count = group.members.length;
    if (count < min || count > max) return false;
    if (filter.state === "done" && !isJudged(verdicts[group.head])) return false;
    if (filter.state === "todo" && isJudged(verdicts[group.head])) return false;
    if (!q) return true;
    const needle = q.toLowerCase();
    return group.head.includes(q)
      || group.members.some((member) => member.includes(q))
      || group.prompts.some((prompt) => prompt.toLowerCase().includes(needle));
  });
}

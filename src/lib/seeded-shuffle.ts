// 결정적(시드) 셔플 — 같은 시드면 같은 순서. 탐색 미리보기와 카테고리 진입 페이지의
// 순서를 일치시키되(같은 날=같은 순서), 날이 바뀌면 순서도 바뀌게(항상 고정 X) 하는 데 사용.

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(arr: T[], seed: string): T[] {
  const rng = mulberry32(hashStr(seed));
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 오늘 날짜 키 (날 단위로 순서가 바뀜)
export function dayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export type AccentColor = "brand" | "ink";

// 컬럼(메이슨리)별로 테두리 사진을 배치 — 컬럼마다 시작점을 어긋나게 해 한쪽 쏠림·가로 줄맞춤을 방지.
// 색은 컬럼 안에서 검정↔빨강 교대(독립 랜덤이면 같은 색이 우연히 쭉 이어지는 구간이 생김).
// 간격은 id 해시로 2~3 가변 → 자주 나오되 세로 연속(간격 1)은 없음.
export function assignColumnAccents<T extends { id: string }>(
  columns: T[][]
): Map<string, AccentColor> {
  const out = new Map<string, AccentColor>();
  columns.forEach((col, ci) => {
    let next = ci % 2; // 컬럼마다 첫 테두리 위치를 어긋나게(0~1)
    let k = 0; // 이 컬럼에서 몇 번째 테두리인지 → 교대용
    for (let r = 0; r < col.length; r++) {
      if (r >= next) {
        const id = col[r].id;
        const h = hashStr(id);
        // 컬럼 내 교대 + 열별 시작 오프셋 → 같은 색이 세로로 이어지지 않고, 옆 열과도 다르게 시작
        out.set(id, (k + ci) % 2 === 0 ? "brand" : "ink");
        k++;
        next = r + 2 + (h % 2); // 다음 간격 2~3 (자주, 단 연속 없음)
      }
    }
  });
  return out;
}

// 인접한 두 항목이 같은 키(게시물/앨범)가 되지 않게 재배치 — 우선순위 순서는 최대한 보존.
export function spaceByKey<T>(items: T[], keyOf: (item: T) => string): T[] {
  const pending = [...items];
  const out: T[] = [];
  let last: string | null = null;
  while (pending.length > 0) {
    let idx = pending.findIndex((it) => keyOf(it) !== last);
    if (idx === -1) idx = 0;
    const [picked] = pending.splice(idx, 1);
    out.push(picked);
    last = keyOf(picked);
  }
  return out;
}

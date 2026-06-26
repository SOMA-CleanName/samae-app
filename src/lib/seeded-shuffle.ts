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
// 색은 대부분 브랜드(빨강), 가끔(약 1/4) 검정(ink). 간격은 id 해시로 6~9 가변(단조로움 완화).
export function assignColumnAccents<T extends { id: string }>(
  columns: T[][]
): Map<string, AccentColor> {
  const out = new Map<string, AccentColor>();
  columns.forEach((col, ci) => {
    let next = 2 + ((ci * 3) % 5); // 컬럼마다 첫 테두리 위치를 다르게(2~6)
    for (let r = 0; r < col.length; r++) {
      if (r >= next) {
        const id = col[r].id;
        const h = hashStr(id);
        out.set(id, h % 4 === 0 ? "ink" : "brand"); // 1/4 검정, 3/4 빨강
        next = r + 6 + (h % 4); // 다음 간격 6~9
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

// 탐색 갤러리의 컬럼 분배 알고리즘 — ExploreGallery 와 캐스팅 사진 선택이 공유한다.
//
// 높이 균형 그리디: 각 사진을 지금 가장 짧은 컬럼에 넣는다.
// 순서가 고정이면 prefix-stable — 뒤에 사진이 더 붙어도 앞 사진들의 컬럼·위치가 바뀌지 않는다.
// (점진 노출/무한 스크롤에서 이미 보던 카드가 재배치되지 않는 것이 이 알고리즘을 쓰는 이유다)

export type MasonryItem = { id: string; width: number; height: number };

export type Positioned<T> = { id: string; item: T; index: number };

export function buildMasonryColumns<T extends MasonryItem>(
  items: T[],
  colCount: number,
): Positioned<T>[][] {
  const cols: Positioned<T>[][] = Array.from({ length: colCount }, () => []);
  const heights = new Array<number>(colCount).fill(0);
  for (const [index, it] of items.entries()) {
    const ratio = it.width > 0 && it.height > 0 ? it.height / it.width : 1; // 단위 폭당 상대 높이
    let min = 0;
    for (let c = 1; c < colCount; c += 1) if (heights[c] < heights[min]) min = c;
    cols[min].push({ id: it.id, item: it, index });
    heights[min] += ratio;
  }
  return cols;
}

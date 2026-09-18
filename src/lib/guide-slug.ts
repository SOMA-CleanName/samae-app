// 가이드 슬러그 디코딩 — **순수 함수만.**
//
// guide.ts 에 두면 테스트에서 못 부른다. 거기는 createPublicClient 를 통해 "server-only"
// 를 물고 있어서 node 테스트 러너에서 터진다 (booking-format 을 떼어낸 것과 같은 이유).
//
// 이 한 줄이 왜 따로 테스트될 값어치가 있는지 —
// 2026-09-17 에 `/guide` 개별 문답 14개가 **전부 404** 였다. generateStaticParams 가
// 슬러그를 미리 encodeURIComponent 해서 넘기는 바람에 이중 인코딩된 경로로 프리렌더됐고,
// 조회하는 쪽이 한 겹만 벗기니 아무것도 못 찾아 notFound() 가 404 페이지로 구워졌다.
// 빌드는 통과하고 에러도 없어서 **아무 신호 없이** 몇 주를 그렇게 있었다.

/**
 * 인코딩된 슬러그를 원본으로 되돌린다.
 *
 * 한글 slug 라 인코딩된 채 들어온다 — Next 16 은 동적 param 을 자동 디코딩하지 않는다.
 *
 * ⚠️ **더 이상 안 변할 때까지** 푼다. 한 겹만 벗기면 이중 인코딩이 들어왔을 때 조용히
 *    못 찾는다. 횟수는 3 으로 묶는다 — `%` 가 든 값을 끝없이 풀지 않기 위해서다.
 */
export function decodeSlug(raw: string): string {
  let cur = raw;
  for (let i = 0; i < 3; i++) {
    let next: string;
    try {
      next = decodeURIComponent(cur);
    } catch {
      return cur; // 깨진 인코딩 — 지금 값 그대로 찾아본다
    }
    if (next === cur) return cur;
    cur = next;
  }
  return cur;
}

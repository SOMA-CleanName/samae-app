// 큰 목록에서 **아무 데나 한 줌** 집어내는 산수.
//
// 로그인·가입 배경(lib/auth-backdrop)이 쓴다. 거기는 `server-only` 라 테스트가 못 도는데,
// 정작 틀리기 쉬운 부분은 DB 가 아니라 여기 경계 계산이다 — 창이 목록을 넘어가면 range 가
// 빈 배열을 돌려주고 화면이 통째로 비고, 시작점이 한 칸 모자라면 **맨 끝 사진들은 영영
// 안 뜬다.** 그래서 순수 함수로 떼어 둔다 (lib/admin-nav·banner-state 와 같은 방식).
//
// `rand` 를 주입받는 이유도 같다. Math.random() 을 그대로 부르면 "0 일 때"와 "1 직전일 때"
// 를 확인할 방법이 없다.

export type Window = {
  /** 0-based 시작 인덱스 (PostgREST `.range(start, …)` 에 그대로 넣는다) */
  start: number;
  /** 집어올 개수. 0 이면 가져올 게 없다는 뜻 */
  size: number;
};

/**
 * 전체 `total` 개 중에서 `size` 개짜리 구간을 무작위 위치에 잡는다.
 *
 * 필요한 수(`want`)보다 **넉넉히**(기본 4배) 가져와서 섞는다. 딱 필요한 만큼만 떼면
 * 같은 구간이 통째로 같은 순서로 나와 "랜덤" 이 잘 안 느껴진다.
 *
 * ⚠️ 전부 받아서 섞는 방법도 있지만 사진이 1,600장(계속 는다)이라 매 렌더마다 끌어오는 건
 *    과하다. `ORDER BY random()` 은 PostgREST 로 보낼 수 없다.
 */
export function pickWindow(total: number, want: number, rand: () => number = Math.random): Window {
  if (total <= 0 || want <= 0) return { start: 0, size: 0 };

  const size = Math.min(total, want * 4);
  const maxStart = total - size;
  if (maxStart <= 0) return { start: 0, size };

  // +1 이라야 **마지막 구간도 뽑힌다.** 이게 없으면 목록 맨 끝 사진은 한 번도 안 나온다.
  // clamp 는 rand() 가 1 을 돌려주는 경우(스텁·이상 구현)를 막는 안전장치.
  const start = Math.min(maxStart, Math.floor(rand() * (maxStart + 1)));
  return { start, size };
}

/** Fisher–Yates. **원본은 건드리지 않는다** — 호출부가 같은 배열을 다시 쓸 수 있다 */
export function shuffle<T>(items: readonly T[], rand: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

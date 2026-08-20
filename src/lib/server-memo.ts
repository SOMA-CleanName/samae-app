// 서버 인메모리 TTL 메모 — 요청 간에 비싼 조회 결과를 잠깐 재사용한다.
//
// Next 16 의 캐시 API('use cache' 등) 대신 이걸 쓰는 이유:
//   · 프레임워크 캐시 계층은 v16 에서 크게 바뀌어(CLAUDE.md 경고) 동작 검증 비용이 크고,
//   · Vercel Fluid Compute 는 함수 인스턴스를 오래 재사용하므로 모듈 메모리가 실제로 살아남는다.
// 트레이드오프: 인스턴스별 캐시라 첫 방문자는 원래 속도(스켈레톤)를 본다. TTL 이 짧아
// 운영자 큐레이션 변경도 최대 그 시간만 늦게 반영된다.
//
// in-flight 공유: 같은 키의 동시 요청은 같은 Promise 를 기다린다 — 캐시가 비었을 때
// 트래픽이 몰려도 원본 조회는 1번만 나간다(thundering herd 방지).
import "server-only";

type Entry = { exp: number; promise: Promise<unknown> };

const store = new Map<string, Entry>();
const MAX_KEYS = 200;

export async function memoTtl<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.exp > now) return hit.promise as Promise<T>;

  const promise = fn().catch((e) => {
    // 실패는 캐시하지 않는다 — 일시 장애가 TTL 동안 고착되면 안 된다
    store.delete(key);
    throw e;
  });

  if (store.size >= MAX_KEYS) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { exp: now + ttlMs, promise });
  return promise;
}

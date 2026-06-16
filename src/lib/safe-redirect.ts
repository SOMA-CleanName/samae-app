import "server-only";

// 인증 콜백의 `next` 파라미터 검증 — 오픈 리다이렉트(피싱) 방지.
// 내부 경로(같은 출처)만 허용하고, 절대 URL·프로토콜 상대(`//`)·백슬래시 트릭은 fallback 으로 막는다.
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  // 1차 차단 — 반드시 "/"로 시작하고 "//"·"/\"(프로토콜 상대/백슬래시)는 거부
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  try {
    // dummy origin 기준으로 파싱 — 백슬래시 등이 정규화돼 호스트가 바뀌면 외부 경로로 간주
    const url = new URL(next, "http://internal.invalid");
    if (url.origin !== "http://internal.invalid") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

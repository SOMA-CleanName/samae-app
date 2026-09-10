// 클라이언트용 `next` 검증 — src/lib/safe-redirect.ts(server-only)와 같은 규칙.
// 로그인·회원가입 페이지가 공유한다 (오픈 리다이렉트 방지).
export function safeClientNext(next: string | null | undefined, fallback: string): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  try {
    const url = new URL(next, "http://internal.invalid");
    if (url.origin !== "http://internal.invalid") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

/** 현재 주소의 ?next= 를 검증해 돌려준다 (브라우저 전용) */
export function readNextParam(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return safeClientNext(new URLSearchParams(window.location.search).get("next"), fallback);
}

/** OAuth 왕복에서 복귀 경로를 살리는 쿠키 — /auth/callback 이 읽는다 */
export const OAUTH_NEXT_COOKIE = "samae_oauth_next";

export function setOauthNextCookie(next: string): void {
  document.cookie = `${OAUTH_NEXT_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=600; SameSite=Lax`;
}

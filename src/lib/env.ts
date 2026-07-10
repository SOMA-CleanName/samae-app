// 앱 실행 환경 판정 (dev/prod 분리 — docs/19).
// 우선순위: 명시적 NEXT_PUBLIC_ENV → Vercel 자동 주입 VERCEL_ENV → 로컬 기본 development.
//
// · 서버측은 지금도 VERCEL_ENV(production/preview) 로 정확히 동작한다.
// · 클라이언트 번들에선 NEXT_PUBLIC_ 접두사만 인라인되므로, 클라이언트에서도 정확히 판정하려면
//   Vercel Production 스코프에 NEXT_PUBLIC_ENV=production 을 넣어야 한다(Phase 3). 그 전 클라이언트는
//   development 로 취급된다(분석 토큰 스코프 분리로 이미 안전).
export const APP_ENV =
  process.env.NEXT_PUBLIC_ENV || process.env.VERCEL_ENV || "development";

export const isProd = APP_ENV === "production";

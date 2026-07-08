// Sentry 서버 런타임 init — 에러 추적(errors-only).
// DSN(NEXT_PUBLIC_SENTRY_DSN) 없으면 비활성(no-op). 성능 트레이싱/리플레이는 끔(쿼터 절약).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  tracesSampleRate: 0, // 성능 트레이싱 off — 에러만
  environment: process.env.NEXT_PUBLIC_ENV || process.env.VERCEL_ENV || "development",
  // 개발 노이즈 억제(원하면 true)
  debug: false,
});

// Sentry 클라이언트 init (브라우저). DSN 없으면 no-op. 에러만(트레이싱·리플레이 off).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  environment: process.env.NEXT_PUBLIC_ENV || process.env.VERCEL_ENV || "development",
  debug: false,
});

// App Router 네비게이션 계측 훅(트레이싱 켤 때 사용). 에러만 쓰면 사실상 무동작.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

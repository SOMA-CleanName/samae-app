// Sentry 엣지 런타임 init (미들웨어·엣지 함수). DSN 없으면 no-op.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  tracesSampleRate: 0,
  environment: process.env.NEXT_PUBLIC_ENV || process.env.VERCEL_ENV || "development",
  debug: false,
});

// Next.js instrumentation — 런타임별 Sentry 서버/엣지 init 로드 + 서버 요청 에러 캡처.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// 서버 컴포넌트/라우트/액션에서 던져진 에러를 Sentry로 (Next 15+ 훅).
export const onRequestError = Sentry.captureRequestError;

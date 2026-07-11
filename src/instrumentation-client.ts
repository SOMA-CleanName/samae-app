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
  // 인앱 브라우저(인스타·페북·카카오 등)가 웹뷰에 주입한 스크립트가 네이티브 브리지
  // (window.webkit.messageHandlers)를 찾다 자폭하는 노이즈. 우리 코드가 아니라 광고
  // 유입 경로(인앱 웹뷰)에서만 발생 → 실제 버그를 가리지 않게 무시.
  ignoreErrors: [
    /webkit\.messageHandlers/i,
    /messageHandlers/i,
    "sendDataToNative",
    "sendPageHideMessage",
    /instantSearchSDK/i,
  ],
});

// App Router 네비게이션 계측 훅(트레이싱 켤 때 사용). 에러만 쓰면 사실상 무동작.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

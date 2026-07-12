// Sentry 클라이언트 init (브라우저). DSN 없으면 no-op. 에러만(트레이싱·리플레이 off).
import * as Sentry from "@sentry/nextjs";
import { isKoreaVisitor } from "@/lib/replay-gate";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
// 세션 리플레이는 한국 방문자만 — 해외 스토리 유입이 무료 쿼터를 잠식하는 걸 막는다.
const recordReplay = isKoreaVisitor();

Sentry.init({
  dsn,
  enabled: !!dsn,
  tracesSampleRate: 0,
  // 세션 리플레이 — 한국 방문자 세션만 녹화(해외 제외로 쿼터 절약). 신청자는 'inquiry_submitted'
  // 태그로 필터. 트래픽 늘면 낮출 것(무료 티어 ~50건/월). 에러 세션은 국가 무관 항상 녹화.
  replaysSessionSampleRate: recordReplay ? 1.0 : 0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    // PII 보호: 입력값 전체 + .mp-mask(연락처)만 마스킹. 사진·텍스트는 흐름 파악 위해 노출.
    Sentry.replayIntegration({
      maskAllText: false,
      maskAllInputs: true,
      blockAllMedia: false,
      mask: [".mp-mask"],
    }),
  ],
  environment: process.env.NEXT_PUBLIC_ENV || process.env.VERCEL_ENV || "development",
  debug: false,
  // 우리 코드가 아닌 외부 주입 스크립트 노이즈 무시(실제 버그를 가리지 않게):
  //  · 인앱 브라우저(인스타·페북·카카오)가 웹뷰에 주입 → 네이티브 브리지 탐색 중 자폭
  //  · 크립토 지갑 확장(MetaMask 등)이 inpage.js 를 주입 → 지갑 미설치 시 연결 실패
  ignoreErrors: [
    /webkit\.messageHandlers/i,
    /messageHandlers/i,
    "sendDataToNative",
    "sendPageHideMessage",
    /instantSearchSDK/i,
    /MetaMask/i,
    /ethereum/i,
    /Failed to connect to MetaMask/i,
    // 안드로이드 인앱 브라우저(인스타 등)가 이탈 시 네이티브 브리지(postMessage) 호출 중
    // 웹뷰가 이미 정리돼 나는 노이즈. 우리 코드 아님.
    /Java object is gone/i,
    /Error invoking postMessage/i,
    /sendBeforeUnloadMessage/i,
  ],
  // 확장 프로그램·인젝션 스크립트에서 발생한 이벤트는 아예 수집 제외
  denyUrls: [
    /inpage\.js/i,
    /navigation_performance_logger/i,
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
    /extension:\/\//i,
  ],
});

// App Router 네비게이션 계측 훅(트레이싱 켤 때 사용). 에러만 쓰면 사실상 무동작.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

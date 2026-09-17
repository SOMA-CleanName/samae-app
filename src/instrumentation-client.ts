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
  // ⚠️ replayIntegration() 을 **여기 적지 않는다.** 여기 적으면 리플레이 기록기(rrweb)가
  //    초기 번들로 딸려 와서 548KB(압축 전)를 모든 지면에 얹는다. 그게 페이지를 옮길 때마다
  //    느린 이유였다(2026-09-16 신고). 아래에서 화면이 그려진 뒤 따로 붙인다.
  integrations: [],
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

// 세션 리플레이는 **첫 화면을 그린 뒤에** 붙인다.
//
// 리플레이는 "무슨 일이 있었는지 나중에 보기" 위한 것이지, 지금 화면을 그리는 데 필요한
// 게 아니다. 그런데 정적으로 얹으면 rrweb 이 초기 번들에 들어가 모든 방문자가 그 값을
// 치른다. 지연 로딩은 Sentry 가 공식으로 지원한다(CDN 에서 받아 addIntegration).
//
// 대가: 붙기 **전에** 난 에러는 리플레이가 없다. 아주 이른 에러는 스택만 남는다 —
// 그 대신 모든 지면이 가벼워진다. 지금 트래픽에선 이쪽이 맞는 거래다.
if (dsn && typeof window !== "undefined") {
  const attach = () =>
    Sentry.lazyLoadIntegration("replayIntegration")
      .then((replayIntegration) => {
        Sentry.addIntegration(
          // PII 보호: 입력값 전체 + .mp-mask(연락처)만 마스킹. 사진·텍스트는 흐름 파악 위해 노출.
          replayIntegration({
            maskAllText: false,
            maskAllInputs: true,
            blockAllMedia: false,
            mask: [".mp-mask"],
          })
        );
      })
      .catch(() => {
        /* 못 불러와도 에러 수집 자체는 계속된다 */
      });

  // 한가해질 때까지 기다린다 — 첫 화면과 경쟁시키지 않는다.
  // (`"requestIdleCallback" in window` 로 분기하면 else 에서 window 가 never 로 좁혀진다)
  const idle = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  if (idle) idle(attach, { timeout: 5000 });
  else window.setTimeout(attach, 2000);
}

// App Router 네비게이션 계측 훅(트레이싱 켤 때 사용). 에러만 쓰면 사실상 무동작.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

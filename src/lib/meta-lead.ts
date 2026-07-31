// '무료로 견적 받아보기' CTA 클릭 = Meta 픽셀 전환(Lead).
// 문의 완료 시점이 아니라 CTA 클릭 시점에 전환을 잡는다(광고 최적화 신호량 확보).
// 브라우저당 1회만 발화 — localStorage 가드로 재클릭·재방문 중복 전환을 막고,
// 같은 eventID 로 클라 픽셀 + 서버 CAPI 를 보내 Meta 가 이중 집계를 자동 제거한다.
const FIRED_KEY = "samae_quote_lead";

export function trackQuoteLead(): void {
  try {
    if (localStorage.getItem(FIRED_KEY)) return; // 이미 전환한 브라우저 — 1회 제한
    const eventID = `quote_${crypto.randomUUID()}`;
    localStorage.setItem(FIRED_KEY, eventID);
    window.fbq?.("track", "Lead", {}, { eventID });
    // 서버측 CAPI 보완(iOS·광고차단으로 픽셀이 유실돼도 서버가 전송)
    const body = JSON.stringify({ eventID });
    const sent = navigator.sendBeacon?.(
      "/api/meta/quote-lead",
      new Blob([body], { type: "application/json" })
    );
    if (!sent) {
      fetch("/api/meta/quote-lead", {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* 추적 실패가 UX 를 막지 않게 */
  }
}

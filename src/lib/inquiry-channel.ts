// 문의 유입 채널 판별 — 어드민 문의 페이지·디스코드 알림 공용.
// utm_medium 이 정확한 신호(paid_social=유료광고 · social=오가닉 스토리).
// utm 이 없으면 fbc 로 폴백하되 '광고'로 단정하지 않는다
// (인스타 인앱 브라우저가 오가닉 클릭에도 fbclid 를 붙이므로).

export type InquiryChannel = { label: string; kind: "ad" | "organic" | "direct" | "unknown" };

export function inquiryChannel(r: {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  fbc: string | null;
}): InquiryChannel {
  const m = r.utm_medium?.toLowerCase() ?? "";
  const camp = r.utm_campaign ? ` · ${r.utm_campaign}` : "";
  if (/paid/.test(m)) return { label: `🎯 메타 광고${camp}`, kind: "ad" };
  if (m === "social") return { label: `📱 스토리·오가닉${camp}`, kind: "organic" };
  if (m) return { label: `${r.utm_source ?? "유입"} · ${r.utm_medium}${camp}`, kind: "organic" };
  if (r.utm_source) return { label: `${r.utm_source}${camp}`, kind: "organic" };
  if (r.fbc) return { label: "인스타 유입 (경로 불명)", kind: "unknown" };
  return { label: "직접 방문", kind: "direct" };
}

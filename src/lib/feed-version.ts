// 피드 추천 알고리즘 세대 태그 — 추천·정렬 로직을 바꿀 때마다 올린다.
// 모든 피드 계측 이벤트(Click Photo·Feed Impressions)에 실려서
// Mixpanel 에서 "버전별 추천 클릭률·노출 효율"로 개선 효과를 분해할 수 있게 한다.
// (문의 위저드의 inquiry_flow_version 과 같은 패턴 — 클라이언트에서 import 가능해야
// 하므로 서버 전용 discovery.ts 가 아닌 독립 파일로 둔다)
export const FEED_ALGO_VERSION = "v2-siglip-tone";

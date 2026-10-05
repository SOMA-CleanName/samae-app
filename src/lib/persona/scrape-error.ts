// 스크래핑이 안 되는 이유 — scrape.ts 와 analyze.ts 가 둘 다 쓴다(순환 import 방지).
//
// 셋 다 **사용자에게는 같은 출구**로 끝난다: 사진을 직접 올려서 분석.
// 그래서 "실패" 가 아니라 "다른 길" 로 보여줘야 한다 — 특히 quota 는 우리 사정이지
// 그 사람 잘못이 아니고, 로그인까지 한 사람에게 "분석 실패" 를 띄우면 최악이다.
export type PersonaScrapeReason =
  /** 비공개 계정 — 피드를 읽을 수 없다 */
  | "private"
  /** 게시물이 없다 */
  | "empty"
  /** 스크래퍼 한도·결제·호출제한 — 우리 쪽 사정 */
  | "quota";

export class PersonaScrapeError extends Error {
  constructor(public reason: PersonaScrapeReason) {
    super(`persona scrape unavailable: ${reason}`);
    this.name = "PersonaScrapeError";
  }
}

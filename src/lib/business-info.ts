/**
 * 사업자 정보.
 *
 * 두 가지 이유로 지면에 떠 있어야 한다.
 *
 * 1) **법정 의무** — 전자상거래법 제10조. 통신판매업자는 상호·대표자·주소·전화번호·
 *    이메일·사업자등록번호·통신판매업 신고번호를 소비자가 알아보기 쉽게 표시해야 한다.
 * 2) **PG 심사 요건** — KG이니시스 안내(2026-09-03): 계약 진행은 "사이트 내 상품 등록 및
 *    사이트 하단 **사업자정보 확인 가능한 단계**까지 구축"되어 있어야 한다.
 *    요구 항목은 사업자번호·상호명·대표자명·사업장주소·연락처 다섯이다.
 *
 * ⚠️ 값이 비면 그 줄은 아예 안 그려진다(lib/channels 와 같은 방식).
 *    틀린 정보를 거는 것보다 낫고, 확정되는 대로 여기만 채우면 된다.
 */

export type BusinessInfo = {
  /** 사업자등록증상 상호 */
  name: string;
  /** 대표자 성명 */
  ceo: string;
  /** 하이픈 포함 10자리 */
  registrationNumber: string;
  /** 사업장 소재지 (사업자등록증 그대로) */
  address: string;
  /**
   * 통신판매업 신고번호.
   * 아직 신고 전이다 — 알뜰폰 개통 후 그 번호로 신고할 예정이라 비워 둔다.
   * 신고하면 "제2026-인천연수-00000호" 꼴로 채운다.
   */
  mailOrderNumber?: string;
  /**
   * 대표 전화.
   * ⚠️ 이 번호는 통신판매업 신고와 함께 **공정위 조회에 공개**된다.
   *    개인 번호를 넣지 말 것 — 사업용 회선(알뜰폰) 개통 후 채운다.
   */
  phone?: string;
  /**
   * 대표 이메일. 공개되는 주소이므로 **개인 메일이 아닌 것**을 쓴다.
   *
   * 도메인 메일(help@samae.ai)을 Zoho 로 만들어 뒀지만 여기 걸지 않는다 —
   * 무료 플랜이 전달·IMAP·POP 을 전부 막아서 **Zoho 웹/앱에 따로 들어가야만** 보인다.
   * 아무도 안 보는 창구가 제일 나쁘다. 팀이 이미 함께 쓰는 메일함을 쓴다.
   * (도메인·MX·DKIM 은 그대로 살려 뒀다. 유료로 올리는 날 여기만 바꾸면 된다)
   */
  email?: string;
};

export const BUSINESS_INFO: BusinessInfo = {
  name: "사매",
  ceo: "김정훈",
  registrationNumber: "827-70-00636",
  address: "인천광역시 연수구 인천타워대로 323, A동 31층 3101호",
  // mailOrderNumber: "제2026-인천연수-00000호",
  // phone: "0000-0000",
  email: "samaephoto@gmail.com",
};

/** 푸터에 한 줄씩 그릴 항목. 값이 없는 건 빠진다. */
export function businessInfoLines(info: BusinessInfo = BUSINESS_INFO) {
  return [
    { label: "상호", value: info.name },
    { label: "대표", value: info.ceo },
    { label: "사업자등록번호", value: info.registrationNumber },
    { label: "통신판매업신고", value: info.mailOrderNumber },
    { label: "주소", value: info.address },
    { label: "전화", value: info.phone },
    { label: "이메일", value: info.email },
  ].filter((l): l is { label: string; value: string } => Boolean(l.value));
}

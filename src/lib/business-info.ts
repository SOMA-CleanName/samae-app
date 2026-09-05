/**
 * 사업자 정보 — 지면에 떠 있어야 하는 이유가 둘이다.
 *
 * 1) **PG·결제채널 심사** — 반려 사유 1순위가 "사이트에 적힌 회사명·사업자번호"와
 *    "채널에 등록한 정보" 의 불일치다. 상호·대표자·사업자등록번호 셋이 맞으면 요건은 충족된다.
 * 2) **전자상거래법 제10조** — 통신판매업자의 표시 의무. 현재 통신판매업 신고 전이라
 *    신고번호만 비워 둔다(인허가 필수 목록에 없어 심사에 걸리지 않는다).
 *
 * ⚠️ 값이 비면 그 줄은 아예 안 그려진다. 틀린 정보를 거는 것보다 낫고,
 *    확정되는 대로 여기만 채우면 지면 전체에 반영된다.
 * ⚠️ 여기 값을 고칠 때는 결제채널에 등록한 정보도 같이 맞출 것 — 어긋나면 심사에서 반려된다.
 */

export type BusinessInfo = {
  /** 사업자등록증상 상호 */
  name: string;
  /** 대표자 성명 */
  ceo: string;
  /** 하이픈 포함 10자리 */
  registrationNumber: string;
  /** 통신판매업 신고번호 — 신고 후 "제2026-인천연수-00000호" 꼴로 채운다 */
  mailOrderNumber?: string;
  /** 대표 전화 — 이 지면과 광고·명함에 그대로 퍼지므로 개인 번호를 넣지 말 것 */
  phone?: string;
  /** 대표 이메일 — 공개되는 주소이므로 개인 메일이 아닌 것을 쓴다 */
  email?: string;
};

export const BUSINESS_INFO: BusinessInfo = {
  name: "사매",
  ceo: "김정훈",
  registrationNumber: "827-70-00636",
  // 070 인터넷전화(제로콜). 정훈 010 으로 착신전환돼 있다.
  // 개인 번호를 쓰지 않는 이유는 공정위 조회 때문이 아니다 — 거기선 휴대폰 형식이
  // 비식별화된다. 노출 지점은 바로 이 지면(제10조 초기화면 표시)이고,
  // 여기 적힌 번호가 광고·명함·PG 가맹점 정보로 그대로 퍼진다.
  phone: "070-5236-4673",
  // 팀 공유 계정. 개인 메일을 쓰면 팀이 문의를 못 본다.
  email: "samaephoto@gmail.com",
};

// 화면에 그릴 항목만 순서대로 — 비어 있는 값은 빠진다.
export function businessInfoRows(info: BusinessInfo = BUSINESS_INFO): {
  label: string;
  value: string;
}[] {
  return [
    { label: "상호", value: info.name },
    { label: "대표자", value: info.ceo },
    { label: "사업자등록번호", value: info.registrationNumber },
    { label: "통신판매업 신고번호", value: info.mailOrderNumber ?? "" },
    { label: "대표전화", value: info.phone ?? "" },
    { label: "이메일", value: info.email ?? "" },
  ].filter((row) => row.value.trim().length > 0);
}

// 어드민 내비의 **등록부** — 어떤 페이지가 어느 그룹에 속하는가.
//
// 컴포넌트에서 떼어낸 이유는 `matchTab` 이 조용히 틀릴 수 있는 종류라서다. 경로 매칭은
// 형제 경로를 잘못 무는 순간(예: `/admin/photos` 가 `/admin/photo-purpose` 를) 화면이
// 안 깨지고 **강조만 엉뚱한 곳에 켜진다.** 눈으로 못 잡는다 — 테스트가 잡는다.
//
// "use client" 를 들이지 않는다. 값과 순수 함수뿐이라 테스트에서 그대로 부른다.

export type Tab = { href: string; label: string; exact?: boolean };
export type Group = { key: string; label: string; tabs: Tab[] };

export const GROUPS: Group[] = [
  {
    key: "ops",
    label: "운영",
    tabs: [
      { href: "/admin", label: "대시보드", exact: true },
      { href: "/admin/transactions", label: "거래·정산" },
      { href: "/admin/inquiries", label: "입금·문의" },
      { href: "/admin/support", label: "사매 문의" },
      { href: "/admin/chats", label: "채팅" },
      { href: "/admin/notifications", label: "알림" },
    ],
  },
  {
    key: "people",
    label: "사람",
    // 「작가 승인」+「작가 관리」는 2026-09-18 에 하나로 합쳤다
    tabs: [
      { href: "/admin/photographers", label: "작가" },
      { href: "/admin/users", label: "회원" },
    ],
  },
  {
    key: "content",
    label: "지면",
    tabs: [
      { href: "/admin/photos", label: "사진 내리기" },
      // 「사진 내리기」 옆 — 둘 다 "이 사진을 써도 되는가" 를 정하는 지면이다
      { href: "/admin/marketing", label: "마케팅 사용" },
      { href: "/admin/photo-purpose", label: "사진 목적&무드" },
      { href: "/admin/banners", label: "홈 배너" },
      { href: "/admin/articles", label: "아티클" },
      // 아티클 옆에 둔다 — 셋 다 매거진(/explore)에 실리는 읽을거리다
      { href: "/admin/guide", label: "Q&A" },
      { href: "/admin/spots", label: "촬영 장소" },
      { href: "/admin/categories", label: "타겟 카테고리" },
      { href: "/admin/explore", label: "무드(탐색)" },
      { href: "/admin/tags", label: "태그" },
    ],
  },
  {
    key: "tools",
    label: "도구",
    tabs: [
      { href: "/admin/analytics", label: "분석" },
      { href: "/admin/search", label: "검색" },
      { href: "/admin/bot-kb", label: "상담봇" },
      { href: "/admin/calculator", label: "손익 계산기" },
      // 휴지통(지운 것) 옆에 둔다 — 둘 다 "지나간 일을 되짚는" 지면이다
      { href: "/admin/audit", label: "운영 기록" },
      { href: "/admin/trash", label: "휴지통" },
    ],
  },
];

/**
 * 지금 주소가 어느 탭인가 — **가장 긴 일치**를 고른다.
 *
 * `startsWith(href)` 만 보면 형제 경로를 잘못 문다. 경계에 `/` 를 붙여
 * `/admin/photos` 가 `/admin/photo-purpose` 를 물지 않게 한다.
 */
export function matchTab(pathname: string): { group: Group; tab: Tab } | null {
  let best: { group: Group; tab: Tab } | null = null;
  for (const group of GROUPS) {
    for (const tab of group.tabs) {
      const hit = tab.exact
        ? pathname === tab.href
        : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
      if (!hit) continue;
      if (!best || tab.href.length > best.tab.href.length) best = { group, tab };
    }
  }
  return best;
}

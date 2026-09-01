import Link from "next/link";

/**
 * 지면 안내 한 줄 — 홈·카테고리 전용.
 *
 * SiteFooter 는 **끝이 있는 지면에만** 붙는다(그쪽 주석 참고). 홈과 카테고리는
 * 무한 스크롤이라 푸터에 영영 안 닿는다. 그런데 그 두 곳이 유입이 가장 많은 지면이고,
 * 결과가 이랬다 —
 *
 *   · 홈에서 나가는 링크가 /guide · /spots · 아티클 카드 몇 장이 전부였다.
 *     /articles(목록) · /trust · /privacy 로 가는 길이 사이트에서 제일 강한 페이지에
 *     하나도 없었다. 크롤러도 사람도 못 간다.
 *   · 결제와 개인정보를 다루는 서비스인데 **메인 화면에 개인정보 처리방침 링크가 없었다.**
 *
 * 그래서 푸터가 아니라 **무한 피드가 시작되기 직전**에 둔다. 아래로는 끝이 없으니
 * 여기가 사람이 닿을 수 있는 마지막 자리다.
 *
 * 상단 바로가기(HomeQuickNav)와 겹치는 건 뺐다 — 매거진·장소·가이드·취향·페르소나는
 * 이미 거기 있다. 같은 곳으로 가는 문을 한 화면에 두 번 만들지 않는다.
 */
const LINKS = [
  { href: "/articles", label: "스냅 촬영 이야기" },
  { href: "/trust", label: "안전하게 촬영하기" },
  { href: "/privacy", label: "개인정보 처리방침" },
];

export function SiteLinksRow() {
  return (
    <nav
      aria-label="사매 안내"
      className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-caption"
    >
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="text-muted underline decoration-line underline-offset-4 transition-colors hover:text-brand hover:decoration-brand"
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

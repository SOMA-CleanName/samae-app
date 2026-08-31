import Link from "next/link";

/**
 * 지면 공통 푸터.
 *
 * 이 서비스에는 푸터가 없었다. 지면마다 각자 끝맺음을 갖고 있어서
 * 개인정보 처리방침·안전 안내처럼 **어디서든 닿아야 하는 것**에 갈 길이 없었다.
 *
 * 끝이 있는 지면에만 붙인다. 홈과 검색 결과는 무한 스크롤이라 푸터에 영영 못 닿고,
 * 문의·채팅·사진 상세 같은 몰입 흐름에서는 아래에 링크 뭉치가 있으면 방해가 된다.
 * (탐색 탭은 판권면이 그 자리를 맡고 있어 거기에 링크만 얹었다)
 */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line pt-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-4">
        <Link
          href="/"
          className="font-display text-xl italic leading-none text-brand transition-opacity hover:opacity-80"
        >
          samae
        </Link>

        <nav aria-label="사매 안내" className="flex flex-wrap gap-x-5 gap-y-2 text-body-sm">
          {[
            { href: "/articles", label: "스냅 촬영 이야기" },
            { href: "/spots", label: "촬영 장소" },
            { href: "/guide", label: "자주 묻는 것" },
            { href: "/trust", label: "안전하게 촬영하기" },
            { href: "/privacy", label: "개인정보 처리방침" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-muted transition-colors hover:text-brand"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>

      <p className="mt-5 text-[11px] leading-relaxed text-faint">
        사진을 고르면 그 사진을 찍은 작가로 이어집니다. 결제는 사매 계좌로 받고, 연락처는
        채팅 밖으로 나가지 않아요.
      </p>
    </footer>
  );
}

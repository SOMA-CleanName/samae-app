import Link from "next/link";
import { BusinessInfoBlock } from "@/components/BusinessInfoBlock";

/**
 * 지면 안내 한 줄 — 홈·카테고리 전용.
 *
 * SiteFooter 는 **끝이 있는 지면에만** 붙는다(그쪽 주석 참고). 홈과 카테고리는
 * 무한 스크롤이라 푸터에 영영 안 닿는다. 그런데 그 두 곳이 유입이 가장 많은 지면이고,
 * 결과가 이랬다 —
 *
 *   · 홈에서 나가는 링크가 /guide · /spots · 아티클 카드 몇 장이 전부였다.
 *     /articles(목록) · /privacy 로 가는 길이 사이트에서 제일 강한 페이지에
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
  // ⚠️ /trust 는 이 브랜치에 없다 — 그 지면은 에스크로·연락처 비공개(새 모델)를
  //    설명하는데 지금 운영은 리드 판매다. 지면과 함께 본배포 때 되살릴 것.
  //
  // 🔴 /terms 는 **법정 표시 항목**이다. 전자상거래법 제10조가 사이버몰 운영자에게
  //    상호·대표자·주소·전화·이메일·사업자등록번호와 함께 **"사이버몰 이용약관"** 을
  //    **초기화면에 표시**하도록 요구한다. 홈이 곧 초기화면이므로 여기서 빠지면
  //    의무 미이행이다. 가입 화면에만 링크가 있던 상태였다.
  { href: "/terms", label: "이용약관" },
  { href: "/privacy", label: "개인정보 처리방침" },
];

export function SiteLinksRow() {
  return (
    <div className="mb-5 px-1">
      <nav
        aria-label="사매 안내"
        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption"
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

      {/*
        사업자 정보도 같은 이유로 여기 붙는다 — 홈·카테고리는 푸터에 안 닿는데,
        전자상거래법 표시 의무와 PG 입점 심사는 **유입이 가장 많은 지면**에서
        확인되기를 요구한다. 링크 줄 아래, 피드 시작 직전.
      */}
      <BusinessInfoBlock className="mt-4" />
    </div>
  );
}

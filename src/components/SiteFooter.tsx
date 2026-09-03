import Link from "next/link";
import { activeChannels } from "@/lib/channels";
import { BusinessInfoBlock } from "@/components/BusinessInfoBlock";

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
  const channels = activeChannels();

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
            // ⚠️ /trust 는 이 브랜치에 없다 — 그 지면은 에스크로·연락처 비공개(새 모델)를
            //    설명하는데 지금 운영은 리드 판매다. 지면과 함께 본배포 때 되살릴 것.
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

      {/*
        사매 공식 채널.
        ⚠️ 여기 있는 건 **사매의 채널**이지 작가에게 연락하는 길이 아니다.
           문의·채팅 근처에는 두지 않는다 — 거기 있으면 "작가랑 카톡으로 얘기하면 되나"가 된다.
           주소가 비면 이 줄이 통째로 안 그려진다(lib/channels).
      */}
      {channels.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">
            사매 공식 채널
          </span>
          {channels.map((c) => (
            <a
              key={c.key}
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-body-sm text-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-brand"
            >
              {c.label}
            </a>
          ))}
        </div>
      )}

      <p className="mt-5 text-[11px] leading-relaxed text-faint">
        사진을 고르면 그 사진을 찍은 작가로 이어집니다. 결제는 사매 계좌로 받고, 연락처는
        채팅 밖으로 나가지 않아요.
      </p>

      {/*
        사업자 정보 — 전자상거래법 제10조 표시 의무 + PG 입점 심사 요건.
        확정 안 된 항목(통신판매업 신고번호·전화)은 lib/business-info 에서
        비어 있어 자동으로 빠진다.
      */}
      <BusinessInfoBlock className="mt-6 border-t border-line pt-4" />
    </footer>
  );
}

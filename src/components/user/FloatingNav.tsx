"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui";
import { HomeIcon, SearchIcon, ClipboardIcon } from "@/components/user/icons";
import { ProfileSheet, type ProfileMe } from "./ProfileSheet";
import { useNavReveal } from "./NavReveal";

// 하단 플로팅 내비 — 기존 하단바/레일 대체.
// 가운데: 홈/탐색 pill. (로그인 시) 좌측 하단: 계정 아바타 → ProfileSheet. 우측 하단: 장바구니(FloatingCart).
// 상세페이지 등에선 스크롤로 노출(forced) — 기본은 항상 보임.
export function FloatingNav({
  me,
  hasInquiries = false,
}: {
  me: ProfileMe | null;
  hasInquiries?: boolean;
}) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { forced } = useNavReveal();

  // 홈 = 메인 피드(카테고리 컨텍스트는 쿠키로 복원), 탐색 = /explore
  const homeActive = pathname === "/" || pathname.startsWith("/c/");
  const exploreActive = pathname.startsWith("/explore");
  const inquiriesActive = pathname.startsWith("/my-inquiries");

  // 문의·채팅 같은 풀스크린 몰입 플로우에선 내비를 아예 렌더하지 않음 — 전환·애니메이션 중
  // 그 위(z-50)로 잠깐 새어 보이던 문제 방지.
  if (pathname.startsWith("/inquiry") || pathname.startsWith("/chat")) return null;

  // 상세(/photos/[id])에선 기본 숨김 + 스크롤로만 노출(forced===true). 그 외엔 기본 보임.
  // usePathname 으로 판단해 라우트가 바뀌는 즉시(로딩 스켈레톤 단계부터) 사라진다.
  const onDetail = pathname.startsWith("/photos/");
  const visible = onDetail ? forced === true : forced ?? true;
  // 아래에서 위로 올라오는 슬라이드 (숨김 시 화면 아래로)
  const revealStyle = {
    // translate3d + will-change 로 별도 합성 레이어 승격 → iOS 사파리가 스크롤 중에도
    // 트랜지션을 컴포지터에서 재생(메인스레드 지연으로 '띡' 나타나던 문제 완화).
    transform: visible ? "translate3d(0,0,0)" : "translate3d(0,180%,0)",
    opacity: visible ? 1 : 0,
    // 숨김 시 히트영역 제거 — translate 로 시각만 사라지고 레이아웃 박스는 원위치에 남아
    // 그 자리(하단) 터치가 막히던 문제 방지.
    pointerEvents: visible ? "auto" : "none",
    willChange: "transform, opacity",
    transition: "transform 320ms cubic-bezier(.4,0,.2,1), opacity 260ms ease",
  } as React.CSSProperties;

  return (
    <>
      {/* 가운데 홈/탐색 pill — 바깥 nav 의 레이아웃 박스도 숨김 시 터치 통과시킴 */}
      <nav
        className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2"
        style={{ pointerEvents: visible ? "auto" : "none" }}
      >
        <div style={revealStyle}>
          <div className="flex items-center gap-1 rounded-full bg-bg/95 p-1 shadow-lg ring-1 ring-line backdrop-blur">
            {/* '문의' — 문의 내역이 있을 때만(쿠키·비로그인 포함). 맨 앞에 노출 */}
            {hasInquiries && (
              <NavPill
                href="/my-inquiries"
                label="문의"
                active={inquiriesActive}
                icon={<ClipboardIcon className="h-5 w-5" />}
              />
            )}
            <NavPill href="/" label="홈" active={homeActive} icon={<HomeIcon className="h-5 w-5" />} />
            <NavPill
              href="/explore"
              label="탐색"
              active={exploreActive}
              icon={<SearchIcon className="h-5 w-5" />}
            />
          </div>
        </div>
      </nav>

      {/* 좌측 하단 계정 (로그인 시) */}
      {me && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="내 메뉴"
          aria-haspopup="dialog"
          style={revealStyle}
          className="fixed bottom-6 left-5 z-40 grid cursor-pointer place-items-center rounded-full bg-bg/95 p-1 shadow-lg ring-1 ring-line backdrop-blur"
        >
          <Avatar src={me.avatarUrl} name={me.displayName || me.email} size="sm" />
        </button>
      )}

      {me && <ProfileSheet me={me} open={sheetOpen} onClose={() => setSheetOpen(false)} />}
    </>
  );
}

function NavPill({
  href,
  label,
  active,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false} // 탭 전환 시 최상단 강제 스크롤 방지 — 위치 복원은 ScrollMemory 가 담당
      aria-current={active ? "page" : undefined}
      className={[
        // 탭 균등 너비 — 라벨 길이 달라도 같은 크기
        "flex min-w-[5.5rem] items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
        active ? "bg-brand text-white" : "text-fg/65 hover:bg-brand/[0.08] hover:text-brand",
      ].join(" ")}
    >
      {icon}
      {label}
    </Link>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui";
import { HomeIcon, SearchIcon } from "@/components/user/icons";
import { ProfileSheet, type ProfileMe } from "./ProfileSheet";

// 하단 플로팅 내비 — 기존 하단바/레일 대체.
// 가운데: 홈/탐색 pill. (로그인 시) 좌측 하단: 계정 아바타 → ProfileSheet. 우측 하단: 장바구니(FloatingCart).
export function FloatingNav({ me }: { me: ProfileMe | null }) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  // 홈 = 메인 피드(카테고리 컨텍스트는 쿠키로 복원), 탐색 = /explore
  const homeActive = pathname === "/" || pathname.startsWith("/c/");
  const exploreActive = pathname.startsWith("/explore");

  return (
    <>
      {/* 가운데 홈/탐색 pill */}
      <nav className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2">
        <div className="flex items-center gap-1 rounded-full bg-bg/95 p-1 shadow-lg ring-1 ring-line backdrop-blur">
          <NavPill href="/" label="홈" active={homeActive} icon={<HomeIcon className="h-5 w-5" />} />
          <NavPill
            href="/explore"
            label="탐색"
            active={exploreActive}
            icon={<SearchIcon className="h-5 w-5" />}
          />
        </div>
      </nav>

      {/* 좌측 하단 계정 (로그인 시) */}
      {me && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="내 메뉴"
          aria-haspopup="dialog"
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

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui";
import { ProfileSheet, type ProfileMe } from "./ProfileSheet";
import {
  HomeIcon,
  HeartIcon,
  UserIcon,
  BellIcon,
  CameraIcon,
} from "./icons";

// 하단바/레일에 들어갈 코어 항목 아이콘 키
export type NavIconKey = "home" | "heart" | "bell" | "studio";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconKey;
  badge?: number;
};

// 통일감을 위해 전부 아웃라인(같은 stroke 톤·크기)으로. 활성은 색+펠릿으로 표시.
function renderIcon(key: NavIconKey) {
  const cls = "h-6 w-6";
  switch (key) {
    case "home":
      return <HomeIcon className={cls} />;
    case "heart":
      return <HeartIcon className={cls} />;
    case "bell":
      return <BellIcon className={cls} />;
    case "studio":
      return <CameraIcon className={cls} />;
  }
}

// 통합 내비 — 데스크톱: 좌측 아이콘 레일(코어 + 하단 프로필) / 모바일: 하단 탭바 5칸.
// 상단바를 없애고 계정 메뉴를 프로필 시트로 흡수.
export function Sidebar({
  items,
  me,
}: {
  items: NavItem[];
  me: ProfileMe | null;
}) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  // 탐색 "홈" 목적지 — 카테고리(/c/slug)에서 진입했으면 그 카테고리로, 기본 탐색(/)·검색(/?q=)이면 "/".
  const [homeHref, setHomeHref] = useState("/");

  // 현재 경로로 홈 목적지를 갱신·기억(세션 유지). 사진 상세 등 중간 페이지에선 직전 기억 유지.
  useEffect(() => {
    const KEY = "explore:home";
    if (pathname.startsWith("/c/")) sessionStorage.setItem(KEY, pathname);
    else if (pathname === "/") sessionStorage.setItem(KEY, "/"); // 검색은 항상 /?q= → "/"로 리셋
    setHomeHref(sessionStorage.getItem(KEY) || "/");
  }, [pathname]);

  // 홈(탐색)은 "/" 또는 카테고리(/c/...)일 때 활성, 나머지는 접두 매칭
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/c/") : pathname.startsWith(href);

  const authed = !!me;
  const primaryItems = items.filter((item) => item.href !== "/notifications");
  const bottomItems = items.filter((item) => item.href === "/notifications");
  // 비로그인: 게이트 항목(탐색 제외)은 로그인으로 유도(next로 의도한 곳 복귀)
  const resolveHref = (href: string) =>
    authed || href === "/" ? href : `/login?next=${encodeURIComponent(href)}`;
  // 홈(탐색) 항목은 기억된 탐색 목적지(homeHref)로, 그 외는 기본 규칙
  const navHref = (href: string) => (href === "/" ? homeHref : resolveHref(href));

  const profileSlot = me ? (
    <ProfileButton me={me} onOpen={() => setSheetOpen(true)} />
  ) : (
    <EmptyProfile />
  );

  return (
    <>
      {/* 데스크톱: 좌측 세로 레일 */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[72px] flex-col items-center border-r border-line bg-bg py-3 md:flex">
        <Link
          href={homeHref}
          aria-label="samae 홈"
          className="mb-2 grid h-12 w-12 place-items-center rounded-full text-brand transition-colors hover:bg-brand/10"
        >
          <span className="font-display text-2xl italic leading-none">s</span>
        </Link>

        <nav className="flex flex-1 flex-col items-center gap-1">
          {primaryItems.map((it) => (
            <RailLink key={it.href} item={it} href={navHref(it.href)} active={isActive(it.href)} />
          ))}
        </nav>

        <nav className="mb-2 flex flex-col items-center gap-1">
          {bottomItems.map((it) => (
            <RailLink key={it.href} item={it} href={navHref(it.href)} active={isActive(it.href)} />
          ))}
        </nav>

        {/* 레일 하단 프로필 */}
        <div className="mt-2 flex flex-col items-center">{profileSlot}</div>
      </aside>

      {/* 모바일: 하단 고정 탭바 */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-line bg-bg/95 pb-safe backdrop-blur md:hidden">
        {items.map((it) => {
          const active = isActive(it.href);
          return (
            <Link
              key={it.href}
              href={navHref(it.href)}
              aria-label={it.label}
              aria-current={active ? "page" : undefined}
              className="relative grid h-14 flex-1 place-items-center"
            >
              <span
                className={cn(
                  "grid h-9 w-10 place-items-center rounded-full transition-colors sm:w-12",
                  active ? "bg-fg/[0.08] text-fg" : "text-fg/55"
                )}
              >
                {renderIcon(it.icon)}
              </span>
              {it.badge ? <Badge count={it.badge} /> : null}
            </Link>
          );
        })}
        <div className="grid h-14 flex-1 place-items-center">{profileSlot}</div>
      </nav>

      {me && (
        <ProfileSheet
          me={me}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}

// 프로필 진입 버튼 — 아바타 + 안읽은 알림 빨간 점
function ProfileButton({
  me,
  onOpen,
}: {
  me: ProfileMe;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="내 메뉴"
      aria-haspopup="dialog"
      className="relative grid place-items-center rounded-full p-0.5 transition-colors hover:bg-fg/[0.06] cursor-pointer"
    >
      <Avatar
        src={me.avatarUrl}
        name={me.displayName || me.email}
        size="xs"
        className="ring-1 ring-fg/30"
      />
    </button>
  );
}

// 비로그인 프로필 자리 — 클릭 시 메뉴 없이 바로 로그인 화면으로 이동
function EmptyProfile() {
  return (
    <Link
      href="/login"
      aria-label="로그인"
      className="grid h-6 w-6 cursor-pointer place-items-center rounded-full text-fg/55 ring-1 ring-fg/30 transition-colors hover:text-fg/80"
    >
      <UserIcon className="h-3.5 w-3.5" />
    </Link>
  );
}

function RailLink({ item, href, active }: { item: NavItem; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      title={item.label}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative grid h-12 w-12 place-items-center rounded-2xl transition-colors",
        active ? "bg-fg/[0.08] text-fg" : "text-fg/60 hover:bg-fg/[0.05] hover:text-fg"
      )}
    >
      {renderIcon(item.icon)}
      {item.badge ? <Badge count={item.badge} /> : null}
    </Link>
  );
}

// 안읽음/진행 배지
function Badge({ count }: { count: number }) {
  return (
    <span className="absolute right-1.5 top-1.5 min-w-[16px] rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-4 text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

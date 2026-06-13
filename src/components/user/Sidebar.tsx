"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui";
import { ProfileSheet, type ProfileMe } from "./ProfileSheet";
import {
  HomeIcon,
  HeartIcon,
  CalendarIcon,
  ChatIcon,
} from "./icons";

// 하단바/레일에 들어갈 코어 항목 아이콘 키 (탐색·찜·채팅·예약)
export type NavIconKey = "home" | "heart" | "calendar" | "chat";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconKey;
  badge?: number;
};

function renderIcon(key: NavIconKey, active: boolean) {
  const cls = "h-6 w-6";
  switch (key) {
    case "home":
      return <HomeIcon className={cls} filled={active} />;
    case "heart":
      return <HeartIcon className={cls} filled={active} />;
    case "calendar":
      return <CalendarIcon className={cls} filled={active} />;
    case "chat":
      return <ChatIcon className={cls} filled={active} />;
  }
}

// 통합 내비 — 데스크톱: 좌측 아이콘 레일(코어 + 하단 프로필) / 모바일: 하단 탭바 5칸.
// 상단바를 없애고 계정 메뉴를 프로필 시트로 흡수.
export function Sidebar({
  items,
  me,
  notifUnread,
}: {
  items: NavItem[];
  me: ProfileMe | null;
  notifUnread: number;
}) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  // 홈은 정확히 "/"일 때만 활성, 나머지는 접두 매칭
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // 개별 채팅방은 몰입형 — 모바일 하단바 숨김 (데스크톱 레일은 유지)
  const hideMobileBar = /^\/chat\/.+/.test(pathname);

  const profileSlot = me ? (
    <ProfileButton me={me} notifUnread={notifUnread} onOpen={() => setSheetOpen(true)} />
  ) : (
    <Link
      href="/login"
      className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90"
    >
      로그인
    </Link>
  );

  return (
    <>
      {/* 데스크톱: 좌측 세로 레일 */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[72px] flex-col items-center border-r border-line bg-bg py-3 md:flex">
        <Link
          href="/"
          aria-label="samae 홈"
          className="mb-2 grid h-12 w-12 place-items-center rounded-full text-brand transition-colors hover:bg-brand/10"
        >
          <span className="font-display text-2xl italic leading-none">s</span>
        </Link>

        <nav className="flex flex-1 flex-col items-center gap-1">
          {items.map((it) => (
            <RailLink key={it.href} item={it} active={isActive(it.href)} />
          ))}
        </nav>

        {/* 레일 하단 프로필 */}
        <div className="mt-2 flex flex-col items-center">{profileSlot}</div>
      </aside>

      {/* 모바일: 하단 고정 탭바 */}
      {!hideMobileBar && (
        <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-line bg-bg/95 pb-safe backdrop-blur md:hidden">
          {items.map((it) => {
            const active = isActive(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-label={it.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative grid h-14 w-14 place-items-center rounded-2xl",
                  active ? "text-fg" : "text-fg/55"
                )}
              >
                {renderIcon(it.icon, active)}
                {it.badge ? <Badge count={it.badge} /> : null}
              </Link>
            );
          })}
          <div className="grid h-14 w-14 place-items-center">{profileSlot}</div>
        </nav>
      )}

      {me && (
        <ProfileSheet
          me={me}
          notifUnread={notifUnread}
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
  notifUnread,
  onOpen,
}: {
  me: ProfileMe;
  notifUnread: number;
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
      <Avatar src={me.avatarUrl} name={me.displayName || me.email} size="sm" />
      {notifUnread > 0 && (
        <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-bg bg-brand" />
      )}
    </button>
  );
}

function RailLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative grid h-12 w-12 place-items-center rounded-2xl transition-colors",
        active ? "bg-fg/[0.08] text-fg" : "text-fg/60 hover:bg-fg/[0.05] hover:text-fg"
      )}
    >
      {renderIcon(item.icon, active)}
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

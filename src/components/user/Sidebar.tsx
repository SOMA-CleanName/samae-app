"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  HeartIcon,
  PlusIcon,
  CalendarIcon,
  ChatIcon,
  ShieldIcon,
} from "./icons";

// 레일에 들어갈 아이콘 키 — 직렬화 가능하도록 문자열로 전달받음
export type NavIconKey = "home" | "heart" | "plus" | "calendar" | "chat" | "shield";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconKey;
  badge?: number;
};

// 아이콘 키 → 컴포넌트 매핑 (filled 여부는 활성 상태에 따라 결정)
function renderIcon(key: NavIconKey, active: boolean) {
  const cls = "h-6 w-6";
  switch (key) {
    case "home":
      return <HomeIcon className={cls} filled={active} />;
    case "heart":
      return <HeartIcon className={cls} filled={active} />;
    case "plus":
      return <PlusIcon className={cls} />;
    case "calendar":
      return <CalendarIcon className={cls} filled={active} />;
    case "chat":
      return <ChatIcon className={cls} filled={active} />;
    case "shield":
      return <ShieldIcon className={cls} />;
  }
}

// 핀터레스트식 좌측 아이콘 레일 — 데스크톱 고정, 모바일은 하단 탭으로 전환
export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  // 현재 경로가 항목에 해당하는지 (홈은 정확히 "/"일 때만 활성)
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* 데스크톱: 좌측 세로 레일 */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[72px] flex-col items-center border-r border-fg/8 bg-bg py-3 md:flex">
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
      </aside>

      {/* 모바일: 하단 고정 탭바 */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-fg/8 bg-bg/95 py-2 backdrop-blur md:hidden">
        {items.map((it) => {
          const active = isActive(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-label={it.label}
              className={`relative grid h-10 w-10 place-items-center rounded-full ${
                active ? "text-fg" : "text-fg/55"
              }`}
            >
              {renderIcon(it.icon, active)}
              {it.badge ? <Badge count={it.badge} /> : null}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function RailLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-label={item.label}
      className={`group relative grid h-12 w-12 place-items-center rounded-2xl transition-colors ${
        active ? "bg-fg/[0.08] text-fg" : "text-fg/60 hover:bg-fg/[0.05] hover:text-fg"
      }`}
    >
      {renderIcon(item.icon, active)}
      {item.badge ? <Badge count={item.badge} /> : null}
    </Link>
  );
}

// 안읽음/알림 배지
function Badge({ count }: { count: number }) {
  return (
    <span className="absolute right-1 top-1 min-w-[16px] rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-4 text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

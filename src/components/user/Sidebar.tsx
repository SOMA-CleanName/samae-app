"use client";

import { useState, useRef, useEffect } from "react";
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

  // 홈은 정확히 "/"일 때만 활성, 나머지는 접두 매칭
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const authed = !!me;
  const primaryItems = items.filter((item) => item.href !== "/notifications");
  const bottomItems = items.filter((item) => item.href === "/notifications");
  // 비로그인: 게이트 항목(탐색 제외)은 로그인으로 유도(next로 의도한 곳 복귀)
  const resolveHref = (href: string) =>
    authed || href === "/" ? href : `/login?next=${encodeURIComponent(href)}`;

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
          href="/"
          aria-label="samae 홈"
          className="mb-2 grid h-12 w-12 place-items-center rounded-full text-brand transition-colors hover:bg-brand/10"
        >
          <span className="font-display text-2xl italic leading-none">s</span>
        </Link>

        <nav className="flex flex-1 flex-col items-center gap-1">
          {primaryItems.map((it) => (
            <RailLink key={it.href} item={it} href={resolveHref(it.href)} active={isActive(it.href)} />
          ))}
        </nav>

        <nav className="mb-2 flex flex-col items-center gap-1">
          {bottomItems.map((it) => (
            <RailLink key={it.href} item={it} href={resolveHref(it.href)} active={isActive(it.href)} />
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
              href={resolveHref(it.href)}
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

// 비로그인 프로필 자리 — 클릭 시 작가신청·로그인 메뉴 (둘 다 로그인 화면으로)
function EmptyProfile() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 외부 클릭·Esc로 닫기
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="계정 메뉴"
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-6 w-6 cursor-pointer place-items-center rounded-full text-fg/55 ring-1 ring-fg/30 transition-colors hover:text-fg/80"
      >
        <UserIcon className="h-3.5 w-3.5" />
      </button>

      {open && (
        // 모바일(하단바): 위쪽 우측정렬 / 데스크톱(좌측레일): 오른쪽
        <div
          role="menu"
          className="absolute bottom-full right-0 z-50 mb-2 w-36 rounded-xl border border-line bg-bg p-1 shadow-pop md:bottom-0 md:left-full md:right-auto md:mb-0 md:ml-2"
        >
          <MenuLink href="/apply" onSelect={() => setOpen(false)}>
            작가 신청
          </MenuLink>
          <MenuLink href="/login" onSelect={() => setOpen(false)}>
            로그인
          </MenuLink>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  onSelect,
  children,
}: {
  href: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      role="menuitem"
      href={href}
      onClick={onSelect}
      className="block rounded-lg px-3 py-2 text-sm text-fg/80 transition-colors hover:bg-fg/[0.06] hover:text-fg"
    >
      {children}
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

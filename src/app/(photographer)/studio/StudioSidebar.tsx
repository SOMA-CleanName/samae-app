"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; badge?: number };

// 운영과 설정을 시각적으로 분리한 작가 스튜디오 네비.
// 데스크톱: 좌측 고정 사이드바 / 모바일: 상단 가로 스크롤 바.
export function StudioSidebar() {
  const pathname = usePathname();
  // 홈은 정확히 일치, 나머지는 경로 경계(href 또는 href/...)로 매칭.
  // ('/studio/booking'(예약설정)과 '/studio/bookings'(예약) 접두 충돌 방지)
  const isActive = (href: string) =>
    href === "/studio" ? pathname === "/studio" : pathname === href || pathname.startsWith(href + "/");

  const ops: Item[] = [
    { href: "/studio", label: "대시보드" },
    { href: "/studio/reviews", label: "후기" },
  ];
  const settings: Item[] = [
    { href: "/studio/profile", label: "프로필" },
    { href: "/studio/packages", label: "패키지" },
    { href: "/studio/portfolio", label: "포트폴리오" },
    { href: "/studio/highlights", label: "하이라이트" },
    { href: "/studio/availability", label: "일정" },
    { href: "/studio/booking", label: "예약 설정" },
    { href: "/studio/settlements", label: "수수료" },
  ];

  return (
    <>
      {/* 데스크톱: 좌측 세로 사이드바 */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-52 flex-col border-r border-fg/8 bg-bg px-3 py-5 md:flex">
        <Link href="/" className="px-2 text-lg font-semibold">
          사매 <span className="text-xs font-normal text-fg/45">스튜디오</span>
        </Link>

        <nav className="mt-6 flex flex-1 flex-col gap-1">
          <GroupLabel>운영</GroupLabel>
          {ops.map((it) => (
            <SideLink key={it.href} item={it} active={isActive(it.href)} />
          ))}
          <GroupLabel className="mt-5">설정</GroupLabel>
          {settings.map((it) => (
            <SideLink key={it.href} item={it} active={isActive(it.href)} />
          ))}
        </nav>

        <Link href="/" className="px-3 py-2 text-xs text-fg/45 hover:text-fg">
          ← 탐색으로
        </Link>
      </aside>

      {/* 모바일: 상단 가로 스크롤 탭 */}
      <nav className="sticky top-0 z-40 flex gap-1 overflow-x-auto border-b border-fg/8 bg-bg/95 px-3 py-2 backdrop-blur md:hidden">
        {[...ops, ...settings].map((it) => {
          const active = isActive(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`relative shrink-0 rounded-full px-3 py-1.5 text-sm ${
                active ? "bg-fg text-bg" : "text-fg/60 hover:bg-fg/[0.05]"
              }`}
            >
              {it.label}
              {it.badge ? <Dot /> : null}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function GroupLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-fg/35 ${className}`}>
      {children}
    </p>
  );
}

function SideLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
        active ? "bg-fg/[0.08] font-medium text-fg" : "text-fg/65 hover:bg-fg/[0.05] hover:text-fg"
      }`}
    >
      {item.label}
      {item.badge ? (
        <span className="min-w-[18px] rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-[18px] text-white">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function Dot() {
  return <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand" />;
}

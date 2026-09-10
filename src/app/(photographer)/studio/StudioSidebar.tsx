"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon } from "@/components/user/icons";

type Item = { href: string; label: string; badge?: number };

// 운영과 설정을 시각적으로 분리한 작가 스튜디오 네비.
// 데스크톱: 좌측 고정 사이드바 / 모바일: 상단 가로 스크롤 바.
export function StudioSidebar({ chatUnread = 0 }: { chatUnread?: number }) {
  const pathname = usePathname();
  // 홈은 정확히 일치, 나머지는 경로 경계(href 또는 href/...)로 매칭.
  // ('/studio/booking'(예약설정)과 '/studio/bookings'(예약) 접두 충돌 방지)
  const isActive = (href: string) =>
    href === "/studio" ? pathname === "/studio" : pathname === href || pathname.startsWith(href + "/");

  // 채팅이 맨 앞이다 — 탭이 여덟 개라 가로 스크롤인데, 답장은 가장 급한 일이라
  // 스크롤하지 않고 바로 보여야 한다.
  const ops: Item[] = [
    { href: "/studio/chat", label: "채팅", badge: chatUnread },
    { href: "/studio", label: "문의" },
    // 정산은 에스크로 전환(2026-09)으로 되살렸다. 리드 모델 때 숨겼던 항목인데,
    // 지금은 사매가 촬영비를 받아 수수료를 떼고 작가에게 보내므로 작가가 확인할 지면이
    // 다시 필요하다. **알림톡 「정산 완료」 버튼도 이 경로로 온다** — 메뉴에 없으면
    // 작가가 그 화면을 두 번 다시 찾아갈 수 없다(notify-templates.ts).
    { href: "/studio/bookings", label: "예약 관리" },
    { href: "/studio/settlements", label: "정산" },
    // 후기 탭 숨김(되돌리려면 아래 주석 해제):
    // { href: "/studio/reviews", label: "후기" },
  ];
  // 계속 숨김 — **예약은 채팅방에서만 잡는다.** 작가가 일정·예약 조건을 따로 설정하는
  // 화면은 리드 모델 때 쓰던 것이고, 지금은 상담 중에 작가가 예약을 제안하고 고객이
  // 수락하는 흐름 하나뿐이다. 두 경로가 공존하면 어느 쪽이 진실인지 알 수 없어진다.
  // 위의 '예약 관리'(/studio/bookings)는 잡힌 예약을 **보는** 지면이라 성격이 다르다.
  //   { href: "/studio/availability", label: "일정" },
  //   { href: "/studio/booking", label: "예약 설정" },
  const settings: Item[] = [
    { href: "/studio/guide", label: "고객 안내 이미지" }, // 사진 상세에 노출되는 촬영 안내 이미지
    { href: "/studio/profile", label: "프로필" },
    { href: "/studio/about", label: "소개 페이지" },
    { href: "/studio/packages", label: "패키지" },
    { href: "/studio/portfolio", label: "포트폴리오" },
    { href: "/studio/highlights", label: "하이라이트" },
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
          ← 홈으로
        </Link>
      </aside>

      {/* 모바일: 상단 한 줄 바 — 홈 복귀 + 가로 스크롤 탭 */}
      <nav className="sticky top-0 z-40 flex items-center gap-1.5 border-b border-line bg-bg/95 px-2 py-2 backdrop-blur md:hidden">
        <Link
          href="/"
          aria-label="홈으로"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-fg/70 transition-colors hover:bg-fg/[0.06]"
        >
          <HomeIcon className="h-5 w-5" />
        </Link>
        <span className="h-5 w-px shrink-0 bg-line" />
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          {[...ops, ...settings].map((it) => {
            const active = isActive(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                // 알약은 32px 그대로. 투명 ::before 로 위아래만 6px 씩 벌려 탭 영역을 44px 로.
                // (알약 자체를 44px 로 키우면 상단 바가 통째로 두꺼워진다)
                className={`relative shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] ${
                  active ? "bg-fg text-bg" : "text-fg/60 hover:bg-fg/[0.05]"
                }`}
              >
                {it.label}
                {it.badge ? (
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-white ring-2 ring-bg">
                    {it.badge > 99 ? "99+" : it.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>

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
      // 세로 패딩 대신 min-h-11 — 작가가 매일 쓰는 내비라 36px 은 좁다.
      // py 를 올리면 항목 간 간격까지 벌어져 목록이 길어진다.
      className={`flex min-h-11 items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
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

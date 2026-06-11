"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { SearchIcon, ChevronDownIcon } from "./icons";

type MeProps = {
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  isPhotographer: boolean;
} | null;

// 핀터레스트식 상단 바 — 검색 알약(탐색 화면 한정) + 우측 아바타 메뉴
export function TopBar({ me }: { me: MeProps }) {
  const pathname = usePathname();
  // 개별 채팅방에서는 검색바·헤더바 숨김 (몰입형 대화 화면)
  if (/^\/chat\/.+/.test(pathname)) return null;

  // 검색은 탐색 화면(홈)에서만 노출 — 그 외 페이지는 우측 계정 메뉴만
  const showSearch = pathname === "/";

  return (
    <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur">
      <div className={`flex items-center gap-2 px-3 py-3 sm:px-5 ${showSearch ? "" : "justify-end"}`}>
        {showSearch && <SearchPill />}
        {me ? <UserMenu me={me} /> : <LoginButton />}
      </div>
    </header>
  );
}

// 검색 입력 — 제출 시 ?q= 로 탐색 홈 이동
function SearchPill() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim();
    router.push(v ? `/?q=${encodeURIComponent(v)}` : "/");
  }

  return (
    <form onSubmit={onSubmit} className="relative flex-1">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg/45">
        <SearchIcon />
      </span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="무드 태그로 검색 (예: 감성, 흑백, 우드톤)"
        aria-label="무드 태그 검색"
        className="w-full rounded-full bg-fg/[0.06] py-3 pl-11 pr-4 text-sm outline-none transition focus:bg-white focus:ring-2 focus:ring-fg/15"
      />
    </form>
  );
}

function LoginButton() {
  return (
    <Link
      href="/login"
      className="shrink-0 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
    >
      로그인
    </Link>
  );
}

// 아바타 + 펼침 메뉴
function UserMenu({ me }: { me: NonNullable<MeProps> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const initial = (me.displayName || me.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative flex shrink-0 items-center gap-1">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="내 메뉴"
        className="flex items-center gap-1 rounded-full p-0.5 hover:bg-fg/[0.06]"
      >
        <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-fg text-sm font-bold text-bg">
          {me.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </span>
        <span className="text-fg/55">
          <ChevronDownIcon />
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-2xl border border-fg/10 bg-white py-2 shadow-xl">
          <div className="px-4 py-2">
            <p className="truncate text-sm font-semibold">
              {me.displayName || "사용자"}
            </p>
            {me.email && (
              <p className="truncate text-xs text-fg/50">{me.email}</p>
            )}
          </div>
          <div className="my-1 border-t border-fg/8" />
          <MenuLink href="/studio" onClick={() => setOpen(false)}>
            {me.isPhotographer ? "스튜디오" : "작가 신청"}
          </MenuLink>
          <MenuLink href="/favorites" onClick={() => setOpen(false)}>
            찜한 작가
          </MenuLink>
          <MenuLink href="/bookings" onClick={() => setOpen(false)}>
            내 예약
          </MenuLink>
          <div className="my-1 border-t border-fg/8" />
          <form action={signOut}>
            <button className="w-full px-4 py-2 text-left text-sm text-fg/70 hover:bg-fg/[0.04]">
              로그아웃
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block px-4 py-2 text-sm text-fg/80 hover:bg-fg/[0.04]"
    >
      {children}
    </Link>
  );
}

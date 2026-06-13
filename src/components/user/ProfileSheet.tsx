"use client";

import { useEffect } from "react";
import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { Avatar } from "@/components/ui";
import { BellIcon } from "./icons";

export type ProfileMe = {
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  isPhotographer: boolean;
  isAdmin: boolean;
};

// 프로필 시트 — 하단바 '프로필' 진입.
// 모바일: 하단 바텀시트 / 데스크톱: 좌측 레일 아바타 위 팝오버.
// 구 TopBar의 계정 메뉴 + 과밀 항목(알림·설정·스튜디오·어드민)을 흡수.
export function ProfileSheet({
  me,
  notifUnread,
  open,
  onClose,
}: {
  me: ProfileMe;
  notifUnread: number;
  open: boolean;
  onClose: () => void;
}) {
  // ESC 닫기 + 열렸을 때 배경 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* 배경 — 클릭 시 닫기 */}
      <button
        aria-label="닫기"
        onClick={onClose}
        className="fixed inset-0 z-50 cursor-default bg-black/30 md:bg-black/10"
      />

      {/* 패널 — 모바일 하단 시트 / 데스크톱 좌하단 팝오버 */}
      <div
        role="dialog"
        aria-label="내 메뉴"
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border border-line bg-surface pb-safe shadow-pop
                   md:inset-x-auto md:bottom-4 md:left-[80px] md:w-64 md:rounded-2xl"
      >
        {/* 모바일 그랩 핸들 */}
        <div className="flex justify-center pt-2.5 md:hidden">
          <span className="h-1 w-9 rounded-full bg-line-strong" />
        </div>

        {/* 계정 헤더 */}
        <div className="flex items-center gap-3 px-5 py-4">
          <Avatar src={me.avatarUrl} name={me.displayName || me.email} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{me.displayName || "사용자"}</p>
            {me.email && <p className="truncate text-xs text-muted">{me.email}</p>}
          </div>
        </div>

        <div className="border-t border-line" />

        <nav className="py-1.5">
          <SheetLink href="/notifications" onClick={onClose}>
            <span className="flex items-center gap-2.5">
              <BellIcon className="h-5 w-5 text-fg/55" />
              알림
            </span>
            {notifUnread > 0 && (
              <span className="min-w-[18px] rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                {notifUnread > 99 ? "99+" : notifUnread}
              </span>
            )}
          </SheetLink>
          <SheetLink href="/studio" onClick={onClose}>
            {me.isPhotographer ? "스튜디오" : "작가 신청"}
          </SheetLink>
          {me.isAdmin && (
            <SheetLink href="/admin" onClick={onClose}>
              어드민
            </SheetLink>
          )}
          <SheetLink href="/settings" onClick={onClose}>
            계정 설정
          </SheetLink>
        </nav>

        <div className="border-t border-line" />
        <form action={signOut}>
          <button
            type="submit"
            className="w-full cursor-pointer px-5 py-3.5 text-left text-sm text-muted hover:bg-surface-2 hover:text-fg md:py-3"
          >
            로그아웃
          </button>
        </form>
      </div>
    </>
  );
}

function SheetLink({
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
      className="flex items-center justify-between px-5 py-3.5 text-sm font-medium text-fg/85 hover:bg-surface-2 hover:text-fg md:py-2.5"
    >
      {children}
    </Link>
  );
}

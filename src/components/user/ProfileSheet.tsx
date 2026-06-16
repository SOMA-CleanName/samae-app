"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui";

export type ProfileMe = {
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  isPhotographer: boolean;
  isAdmin: boolean;
};

// 프로필 시트 — 하단바 '프로필' 진입.
// 모바일: 하단에서 슬라이드 업 + 핸들 드래그로 닫기 / 데스크톱: 좌하단 팝오버.
// 구 TopBar의 계정 메뉴 + 과밀 항목(알림·설정·스튜디오·어드민)을 흡수.
export function ProfileSheet({
  me,
  open,
  onClose,
}: {
  me: ProfileMe;
  open: boolean;
  onClose: () => void;
}) {
  const [entered, setEntered] = useState(false); // 슬라이드 업 트리거
  const [dragY, setDragY] = useState(0); // 핸들 드래그 오프셋(아래로 +)
  const dragging = useRef(false);
  const startY = useRef(0);

  // 열릴 때: 아래(100%)에서 시작 → 다음 프레임에 0으로 슬라이드 업
  useEffect(() => {
    if (!open) return;
    setEntered(false);
    setDragY(0);
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  // 부드러운 닫기 — 아래로 내린 뒤 onClose
  const requestClose = useCallback(() => {
    setEntered(false);
    const t = setTimeout(onClose, 250);
    return () => clearTimeout(t);
  }, [onClose]);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  if (!open) return null;

  function onTouchStart(e: React.TouchEvent) {
    dragging.current = true;
    startY.current = e.touches[0].clientY;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!dragging.current) return;
    setDragY(Math.max(0, e.touches[0].clientY - startY.current));
  }
  function onTouchEnd() {
    dragging.current = false;
    if (dragY > 90) requestClose(); // 충분히 내리면 닫기
    else setDragY(0); // 아니면 제자리로
  }

  const transform = !entered
    ? "translateY(100%)"
    : dragY > 0
    ? `translateY(${dragY}px)`
    : "translateY(0)";

  return (
    <>
      {/* 배경 — 클릭 시 닫기, 페이드 */}
      <button
        aria-label="닫기"
        onClick={requestClose}
        className={cn(
          "fixed inset-0 z-50 cursor-default bg-black/30 transition-opacity duration-200 md:bg-black/10",
          entered ? "opacity-100" : "opacity-0"
        )}
      />

      {/* 패널 — 모바일 하단 시트(슬라이드/드래그) / 데스크톱 좌하단 팝오버 */}
      <div
        role="dialog"
        aria-label="내 메뉴"
        style={{ transform }}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border border-line bg-surface pb-safe shadow-pop",
          "md:inset-x-auto md:bottom-4 md:left-[80px] md:w-64 md:rounded-2xl",
          !dragging.current && "transition-transform duration-300 ease-out"
        )}
      >
        {/* 드래그 핸들 — 모바일 전용, 아래로 끌면 닫힘 */}
        <div
          className="touch-none cursor-grab pt-2.5 pb-1 active:cursor-grabbing md:hidden"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="mx-auto h-1.5 w-10 rounded-full bg-line-strong" />
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
          <SheetLink href="/studio" onClick={requestClose}>
            {me.isPhotographer ? "스튜디오" : "작가 신청"}
          </SheetLink>
          {me.isAdmin && (
            <SheetLink href="/admin" onClick={requestClose}>
              어드민
            </SheetLink>
          )}
          <SheetLink href="/settings" onClick={requestClose}>
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

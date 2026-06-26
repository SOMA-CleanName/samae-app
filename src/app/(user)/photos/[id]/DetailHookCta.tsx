"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// A11 혜택형 hook — 상세에서 스크롤 내리면 하단에서 올라오는 모달(바텀시트).
// 뜨면 스크롤 잠금 → 행동(상담 신청 / 닫기) 전까진 탐색 불가.
// 예약 또는 장바구니를 누르면(localStorage 'samae:hooked') 이후로는 안 뜬다.
// 이번 세션에서 닫으면(sessionStorage) 다시 막지 않는다.
const HOOKED_KEY = "samae:hooked";
const DISMISS_KEY = "samae:hook-dismissed";

export function DetailHookCta({ href }: { href: string }) {
  const [blocked, setBlocked] = useState(true); // 하이드레이션 전엔 동작 안 함
  const [open, setOpen] = useState(false);

  // 클라에서 노출 가능 여부 판정 (hooked/dismissed 아니면 활성)
  useEffect(() => {
    try {
      const hooked = localStorage.getItem(HOOKED_KEY) === "1";
      const dismissed = sessionStorage.getItem(DISMISS_KEY) === "1";
      setBlocked(hooked || dismissed);
    } catch {
      setBlocked(false);
    }
  }, []);

  // 스크롤 내리면 1회 발동
  useEffect(() => {
    if (blocked || open) return;
    const onScroll = () => {
      if (window.scrollY > 300) setOpen(true);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [blocked, open]);

  // 열리면 스크롤 잠금 (행동 전까지 탐색 불가)
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const { body } = document;
    const ph = html.style.overflow;
    const pb = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = ph;
      body.style.overflow = pb;
    };
  }, [open]);

  if (blocked) return null;

  function onConvert() {
    try {
      localStorage.setItem(HOOKED_KEY, "1");
    } catch {
      /* 무시 */
    }
  }
  function onDismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* 무시 */
    }
    setOpen(false);
    setBlocked(true);
  }

  return (
    <div className="fixed inset-0 z-[60] font-kr" aria-hidden={!open}>
      {/* 스크림 */}
      <div
        className={`absolute inset-0 bg-black/45 transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {/* 바텀시트 */}
      <div
        role="dialog"
        aria-modal="true"
        className={`absolute inset-x-0 bottom-0 rounded-t-3xl bg-bg px-5 pb-9 pt-6 shadow-pop transition-transform duration-300 ease-out motion-reduce:transition-none ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-fg/15" />
          <p className="text-xl font-bold leading-snug">
            지금 신청하면 <span className="text-brand">첫 촬영 할인</span>
          </p>
          <p className="mt-1.5 text-sm text-muted">
            마음에 드는 사진의 작가에게 무료로 상담받아보세요. 1분이면 끝나요.
          </p>
          <Link
            href={href}
            onClick={onConvert}
            data-track="cta:hook"
            className="mt-5 block w-full rounded-2xl bg-brand py-4 text-base font-bold text-white transition-opacity hover:opacity-90"
          >
            무료 상담 신청하고 할인받기
          </Link>
          <button
            type="button"
            onClick={onDismiss}
            className="mt-3 w-full cursor-pointer py-2 text-sm font-medium text-muted transition-colors hover:text-fg"
          >
            괜찮아요, 더 둘러볼게요
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRightIcon } from "@/components/user/icons";

// A11 혜택형 hook — 상세에서 스크롤 내리면 떠서 전환을 유도.
// 예약 또는 장바구니를 한 번 누르면(localStorage 'samae:hooked') 이후로는 안 뜬다.
const HOOKED_KEY = "samae:hooked";

export function DetailHookCta({ href }: { href: string }) {
  const [hooked, setHooked] = useState(true); // 하이드레이션 전 숨김 → 클라에서 판정
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setHooked(localStorage.getItem(HOOKED_KEY) === "1");
    } catch {
      setHooked(false);
    }
  }, []);

  useEffect(() => {
    if (hooked) return;
    const onScroll = () => setShow(window.scrollY > 300);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hooked]);

  if (hooked) return null;

  return (
    <div
      className={`fixed inset-x-0 bottom-24 z-30 flex justify-center px-4 transition-all duration-300 motion-reduce:transition-none ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <Link
        href={href}
        onClick={() => {
          try {
            localStorage.setItem(HOOKED_KEY, "1");
          } catch {
            /* 무시 */
          }
        }}
        data-track="cta:hook"
        className="flex w-full max-w-md items-center justify-between gap-2 rounded-full bg-brand px-5 py-3.5 text-white shadow-xl ring-1 ring-black/5"
      >
        <span className="text-sm font-bold">지금 상담 신청하고 첫 촬영 할인받기</span>
        <ChevronRightIcon className="h-5 w-5 shrink-0" />
      </Link>
    </div>
  );
}

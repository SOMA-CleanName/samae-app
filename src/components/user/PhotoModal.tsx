"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// 사진 상세를 목록 위에 덮는 오버레이 — 홈/탐색이 언마운트되지 않으므로 뒤 스크롤이 보존된다.
// 닫기는 router.back() 으로 히스토리를 되돌려(=인터셉트 해제) 모달 슬롯을 비운다.
export function PhotoModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  // 뒤(목록) 스크롤 잠금 — position:fixed + top:-y 방식.
  // overflow:hidden 은 body 스크롤을 0 으로 clamp 해 뒤 홈이 최상단으로 '튀는' 플래시를
  // 유발한다. fixed + top:-y 는 홈을 현재 스크롤 위치에 그대로 얼려 튐이 없고,
  // 닫을 때 그 위치로 정확히 복원한다(iOS 사파리에서도 안전).
  useEffect(() => {
    const y = window.scrollY;
    const b = document.body.style;
    const prev = { position: b.position, top: b.top, left: b.left, right: b.right, width: b.width };
    b.position = "fixed";
    b.top = `-${y}px`;
    b.left = "0";
    b.right = "0";
    b.width = "100%";
    return () => {
      b.position = prev.position;
      b.top = prev.top;
      b.left = prev.left;
      b.right = prev.right;
      b.width = prev.width;
      window.scrollTo(0, y);
    };
  }, []);

  // Esc 로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-black/55 backdrop-blur-sm motion-safe:animate-[fadeIn_.14s_ease-out]"
      // 바깥(백드롭) 클릭 시 닫기 — 내부 패널 클릭은 아래 stopPropagation 으로 유지
      onClick={() => router.back()}
    >
      <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>
      <div
        ref={panelRef}
        className="mx-auto min-h-full w-full max-w-5xl bg-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

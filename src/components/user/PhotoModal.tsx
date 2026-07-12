"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// 사진 상세를 목록 위에 덮는 오버레이 — 홈/탐색이 언마운트되지 않으므로 뒤 스크롤이 보존된다.
// 닫기는 router.back() 으로 히스토리를 되돌려(=인터셉트 해제) 모달 슬롯을 비운다.
export function PhotoModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  // 열려 있는 동안 뒤(목록) 스크롤을 잠가 위치를 그대로 보존.
  // overflow:hidden 은 scrollY 를 초기화하지 않으므로 닫으면 원래 자리로 돌아온다.
  useEffect(() => {
    const { style } = document.body;
    const prevOverflow = style.overflow;
    style.overflow = "hidden";
    return () => {
      style.overflow = prevOverflow;
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

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { lockFeed, unlockFeed } from "@/lib/feed-lock";

// 사진 상세를 홈/탐색 위에 덮는 오버레이 — 홈은 언마운트되지 않고 그 자리에 얼려둔다.
// 불투명 일반 흐름 컨테이너라 창(window)이 이 모달을 스크롤한다 → 상세의 하단 내비 노출·
// 추천 무한스크롤(둘 다 window 스크롤 기반)이 전체 페이지와 똑같이 작동한다.
// 닫기는 router.back()(=인터셉트 해제)으로, 얼려둔 홈이 원위치로 복원된다.
export function PhotoModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // 열려 있는 동안 홈 피드를 얼림(참조 카운트 — 모달→모달 연속 전환 시 튐 방지).
  useEffect(() => {
    lockFeed();
    return () => unlockFeed();
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
    <div role="dialog" aria-modal="true" className="relative z-40 min-h-screen bg-bg">
      {children}
    </div>
  );
}

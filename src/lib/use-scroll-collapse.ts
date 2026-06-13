"use client";

import { useEffect, useState } from "react";

// 스크롤 방향에 따라 헤더를 접었다 펴는 상태를 반환.
// 아래로 스크롤(탐색 중) → 숨김 / 위로 스크롤 → 노출 / 최상단 근처 → 항상 노출.
// 2단계(이미지 상세)에서도 재사용 — revealAfter 로 "특정 지점부터 등장" 모드 지원.
export function useScrollCollapse({
  threshold = 8,
  topGuard = 64,
  revealAfter = 0,
}: {
  threshold?: number; // 방향 전환으로 인정할 최소 이동량(px) — 미세 떨림 무시
  topGuard?: number; // 이 높이 미만에선 항상 노출(최상단 보호)
  revealAfter?: number; // 이 스크롤 위치를 넘기 전엔 무조건 숨김(2단계 reveal용)
} = {}) {
  // revealAfter 가 있으면 처음엔 숨긴 채 시작
  const [hidden, setHidden] = useState(revealAfter > 0);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;

    function update() {
      const y = window.scrollY;

      // reveal 모드: 지정 지점 전엔 항상 숨김
      if (revealAfter > 0 && y < revealAfter) {
        setHidden(true);
        lastY = y;
        ticking = false;
        return;
      }

      const diff = y - lastY;
      if (y < topGuard && revealAfter === 0) {
        setHidden(false); // 최상단 근처 노출 (일반 모드만)
      } else if (diff > threshold) {
        setHidden(true); // 아래로 → 숨김
      } else if (diff < -threshold) {
        setHidden(false); // 위로 → 노출
      }
      lastY = y;
      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    update(); // 초기 위치 반영
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold, topGuard, revealAfter]);

  return hidden;
}

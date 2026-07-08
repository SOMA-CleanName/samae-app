"use client";

// 경로별 스크롤 위치 기억 — 홈↔탐색 탭을 왔다 갔다 해도 각 탭의 스크롤이 초기화되지 않게.
// Next 는 네비게이션마다 최상단으로 스크롤하므로, 저장해 둔 위치로 되돌린다.
// (NavPill 링크의 scroll={false} 와 함께 동작. 상세 페이지의 ScrollTop 과 충돌하지 않도록
//  이 컴포넌트는 홈·탐색 페이지에서만 마운트한다.)
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function ScrollMemory() {
  const pathname = usePathname();
  useEffect(() => {
    const key = `samae:scroll:${pathname}`;
    const saved = Number(sessionStorage.getItem(key) || "0");

    // 복원 — 스트리밍으로 콘텐츠 높이가 늘어날 수 있어 짧은 시간(≤500ms) 재시도.
    // 사용자가 스크롤(휠/터치/키)하면 즉시 중단해 의도적 스크롤을 방해하지 않는다.
    // 항상 복원(saved=0 → 최상단): NavPill 의 scroll={false} 로 이전 탭의 스크롤이 남아
    // 첫 방문 시 '약간 내려간 위치'로 보이던 문제 방지.
    let restoring = true;
    const stop = () => (restoring = false);
    if (restoring) {
      const start = performance.now();
      const tick = () => {
        if (!restoring) return;
        window.scrollTo(0, saved);
        if (performance.now() - start < 500) requestAnimationFrame(tick);
        else restoring = false;
      };
      window.addEventListener("wheel", stop, { passive: true });
      window.addEventListener("touchmove", stop, { passive: true });
      window.addEventListener("keydown", stop);
      requestAnimationFrame(tick);
    }

    // 저장 — 복원 중(클램프될 수 있음)엔 덮어쓰지 않는다.
    const onScroll = () => {
      if (restoring) return;
      sessionStorage.setItem(key, String(Math.round(window.scrollY)));
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      // 떠날 때 최종 위치 저장 (탭 전환 직전 스크롤까지 반영)
      sessionStorage.setItem(key, String(Math.round(window.scrollY)));
      restoring = false;
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", stop);
      window.removeEventListener("scroll", onScroll);
    };
  }, [pathname]);
  return null;
}

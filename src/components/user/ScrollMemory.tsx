"use client";

// 경로별 스크롤 위치 기억 — 홈↔탐색 탭을 왔다 갔다 해도 각 탭의 스크롤이 초기화되지 않게.
// Next 는 네비게이션마다 최상단으로 스크롤하므로, 저장해 둔 위치로 되돌린다.
// (NavPill 링크의 scroll={false} 와 함께 동작. 상세 페이지의 ScrollTop 과 충돌하지 않도록
//  이 컴포넌트는 홈·탐색 페이지에서만 마운트한다.)
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function ScrollMemory() {
  const pathname = usePathname();
  const lastKnownY = useRef(0);
  useEffect(() => {
    const key = `samae:scroll:${pathname}`;
    const anchorKey = `samae:scroll-anchor:${pathname}`;
    const saved = Number(sessionStorage.getItem(key) || "0");
    let anchor: { id: string; viewportTop: number } | null = null;
    try {
      const raw = sessionStorage.getItem(anchorKey);
      anchor = raw ? (JSON.parse(raw) as { id: string; viewportTop: number }) : null;
      sessionStorage.removeItem(anchorKey); // 상세에서 돌아오는 이번 복원에만 사용
    } catch {
      sessionStorage.removeItem(anchorKey);
    }
    lastKnownY.current = saved;

    // 복원 — 피드 세션과 이미지 레이아웃이 돌아올 시간을 고려해 최대 2초간 재시도.
    // 사용자가 스크롤(휠/터치/키)하면 즉시 중단해 의도적 스크롤을 방해하지 않는다.
    // 항상 복원(saved=0 → 최상단): NavPill 의 scroll={false} 로 이전 탭의 스크롤이 남아
    // 첫 방문 시 '약간 내려간 위치'로 보이던 문제 방지.
    let restoring = true;
    const stop = () => (restoring = false);
    if (restoring) {
      const start = performance.now();
      const tick = () => {
        if (!restoring) return;
        const anchorNode = anchor
          ? document.querySelector<HTMLElement>(`[data-pid="${CSS.escape(anchor.id)}"]`)
          : null;
        const target = anchorNode
          ? window.scrollY + anchorNode.getBoundingClientRect().top - anchor!.viewportTop
          : saved;
        window.scrollTo(0, target);
        if (performance.now() - start < 2000) requestAnimationFrame(tick);
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
      lastKnownY.current = Math.round(window.scrollY);
      sessionStorage.setItem(key, String(lastKnownY.current));
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      // Next가 화면 전환 중 먼저 scrollY를 0으로 만든 뒤 cleanup을 실행할 수 있다.
      // 마지막으로 관찰한 실제 목록 위치를 저장해 0으로 덮어쓰지 않는다.
      sessionStorage.setItem(key, String(lastKnownY.current));
      restoring = false;
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", stop);
      window.removeEventListener("scroll", onScroll);
    };
  }, [pathname]);
  return null;
}

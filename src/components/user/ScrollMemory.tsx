"use client";

// 경로별 스크롤 위치 기억 — 홈↔탐색 탭을 왔다 갔다 해도 각 탭의 스크롤이 초기화되지 않게.
// Next 는 네비게이션마다 최상단으로 스크롤하므로, 저장해 둔 위치로 되돌린다.
// (NavPill 링크의 scroll={false} 와 함께 동작. 상세 페이지의 ScrollTop 과 충돌하지 않도록
//  이 컴포넌트는 홈·탐색 페이지에서만 마운트한다.)
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const PHOTO_RETURN_RESTORING_KEY = "samae:feed-return-restoring";
const PHOTO_RETURN_RESTORED_EVENT = "samae:feed-return-restored";

export function ScrollMemory({
  freshTop = false,
  targetId,
  targetViewportTop = 0,
  targetBlock = "start",
  animateTarget = false,
}: {
  freshTop?: boolean;
  targetId?: string;
  targetViewportTop?: number;
  targetBlock?: "start" | "center";
  animateTarget?: boolean;
} = {}) {
  const pathname = usePathname();
  const lastKnownY = useRef(0);
  useEffect(() => {
    const key = `samae:scroll:${pathname}`;
    const anchorKey = `samae:scroll-anchor:${pathname}`;
    // 사진 상세 복귀는 PhotoReturnScroll 한 곳만 좌표를 제어한다. 두 복원기가
    // 동시에 scrollTo를 반복하면 중간 좌표가 다음 저장값이 되어 반복할수록 누적 오차가 난다.
    const photoReturnOwnsRestore =
      sessionStorage.getItem(PHOTO_RETURN_RESTORING_KEY) === "1";
    let anchor: { id: string; viewportTop: number } | null = targetId
      ? { id: targetId, viewportTop: targetViewportTop }
      : null;
    try {
      if (!anchor) {
        const raw = sessionStorage.getItem(anchorKey);
        anchor = raw ? (JSON.parse(raw) as { id: string; viewportTop: number }) : null;
      }
      sessionStorage.removeItem(anchorKey); // 상세에서 돌아오는 이번 복원에만 사용
    } catch {
      sessionStorage.removeItem(anchorKey);
    }
    // freshTop: 사진 상세에서 돌아온 게(anchor) 아니면, 저장 위치 무시하고 최상단부터 시작.
    const saved = freshTop && !anchor ? 0 : Number(sessionStorage.getItem(key) || "0");
    lastKnownY.current = saved;

    // 복원 — 피드 세션과 이미지 레이아웃이 돌아올 시간을 고려해 최대 2초간 재시도.
    // 사용자가 스크롤(휠/터치/키)하면 즉시 중단해 의도적 스크롤을 방해하지 않는다.
    // 항상 복원(saved=0 → 최상단): NavPill 의 scroll={false} 로 이전 탭의 스크롤이 남아
    // 첫 방문 시 '약간 내려간 위치'로 보이던 문제 방지.
    let restoring = true;
    let animationFrame: number | null = null;
    let revealTimer: number | null = null;
    const anchorNode = () =>
      anchor
        ? document.querySelector<HTMLElement>(`[data-pid="${CSS.escape(anchor.id)}"]`)
        : null;
    const anchorTarget = () => {
      const rect = anchorNode()?.getBoundingClientRect();
      if (!rect) return null;
      return targetBlock === "center"
        ? window.scrollY + rect.top - (window.innerHeight - rect.height) / 2
        : window.scrollY + rect.top - anchor!.viewportTop;
    };
    const finishAnimatedTarget = () => {
      restoring = false;
      lastKnownY.current = Math.round(window.scrollY);
      sessionStorage.setItem(key, String(lastKnownY.current));
      window.dispatchEvent(new Event("samae:taste-test-arrived"));
    };
    const cancelRestore = () => {
      restoring = false;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      if (revealTimer !== null) window.clearTimeout(revealTimer);
    };
    // 사용자가 직접 스크롤해 복원을 중단시킨 경우 — 그 지점이 곧 기억할 위치.
    const stop = () => {
      cancelRestore();
      lastKnownY.current = Math.round(window.scrollY);
    };

    if (photoReturnOwnsRestore) {
      // PhotoReturnScroll의 완료 이벤트 전까지는 복원도 저장도 하지 않는다.
    } else if (anchor && animateTarget) {
      // 먼저 탐색 화면 최상단을 보여준 뒤 목적지까지 직접 보간해 내려간다.
      window.scrollTo(0, 0);
      lastKnownY.current = 0;
      revealTimer = window.setTimeout(() => {
        const destination = anchorTarget();
        if (destination === null) {
          finishAnimatedTarget();
          return;
        }

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          window.scrollTo(0, destination);
          finishAnimatedTarget();
          return;
        }

        const from = window.scrollY;
        const startedAt = performance.now();
        const duration = 1_100;
        const animate = (now: number) => {
          if (!restoring) return;
          const progress = Math.min((now - startedAt) / duration, 1);
          const eased =
            progress < 0.5
              ? 4 * progress * progress * progress
              : 1 - Math.pow(-2 * progress + 2, 3) / 2;
          const currentDestination = anchorTarget() ?? destination;
          window.scrollTo(0, from + (currentDestination - from) * eased);
          if (progress < 1) animationFrame = requestAnimationFrame(animate);
          else finishAnimatedTarget();
        };
        animationFrame = requestAnimationFrame(animate);
      }, 550);
    } else if (restoring) {
      const start = performance.now();
      const tick = () => {
        if (!restoring) return;
        const target = anchorTarget() ?? saved;
        window.scrollTo(0, target);
        if (performance.now() - start < 2000) requestAnimationFrame(tick);
        else restoring = false;
      };
      requestAnimationFrame(tick);
    }

    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    window.addEventListener("keydown", stop);

    // 배경 스크롤 잠금(도크·모달이 html overflow:hidden) 중에는 브라우저가 스크롤을 0 으로
    // 클램프하며 scroll 이벤트를 쏠 수 있다 — 사용자가 목록을 옮긴 게 아니므로 기억하지 않는다.
    const locked = () => document.documentElement.style.overflow === "hidden";

    // 저장 — 복원 중(클램프될 수 있음)엔 덮어쓰지 않는다.
    const onScroll = () => {
      if (restoring || locked()) return;
      lastKnownY.current = Math.round(window.scrollY);
      sessionStorage.setItem(key, String(lastKnownY.current));
    };
    const onPhotoReturnRestored = () => {
      if (!photoReturnOwnsRestore) return;
      restoring = false;
      lastKnownY.current = Math.round(window.scrollY);
      sessionStorage.setItem(key, String(lastKnownY.current));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener(PHOTO_RETURN_RESTORED_EVENT, onPhotoReturnRestored);

    return () => {
      // Next가 화면 전환 중 먼저 scrollY를 0으로 만든 뒤 cleanup을 실행할 수 있다.
      // 마지막으로 관찰한 실제 목록 위치를 저장해 0으로 덮어쓰지 않는다.
      // (stop() 은 현재 scrollY 로 덮어쓰므로 여기선 쓰지 않는다 — 그게 저장값을 0으로 날리던 원인.
      //  실제로 최상단까지 스크롤한 경우는 onScroll 이 이미 0 을 기록해 둔다.)
      cancelRestore();
      const y = Math.round(window.scrollY);
      if (y > 0 && !locked()) lastKnownY.current = y;
      sessionStorage.setItem(key, String(lastKnownY.current));
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", stop);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener(PHOTO_RETURN_RESTORED_EVENT, onPhotoReturnRestored);
    };
  }, [pathname, freshTop, targetId, targetViewportTop, targetBlock, animateTarget]);
  return null;
}

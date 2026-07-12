"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

type PhotoReturn = {
  pathname: string;
  y: number;
  photoId: string;
  viewportTop: number;
};

const KEY = "samae:photo-return";

// 사용자 영역 layout에 계속 마운트되어 사진 상세 → 목록 복귀를 감지한다.
// 목록 페이지 자체가 Router Cache에 남아 effect가 재실행되지 않는 경우까지 처리한다.
export function PhotoReturnScroll() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const storageKey = pathname.startsWith("/photos/")
      ? `samae:detail-return:${pathname}`
      : KEY;

    let saved: PhotoReturn | null = null;
    try {
      const raw = sessionStorage.getItem(storageKey);
      saved = raw ? (JSON.parse(raw) as PhotoReturn) : null;
    } catch {
      sessionStorage.removeItem(storageKey);
    }
    if (!saved || saved.pathname !== pathname) return;
    sessionStorage.removeItem(storageKey);

    // 복원 위치가 확정되기 전에는 문서를 그리지 않는다. 이전 상세의 맨 위가
    // 한 프레임 보였다가 아래로 이동하는 플래시를 완전히 차단한다.
    document.documentElement.style.visibility = "hidden";
    window.scrollTo(0, saved.y);

    let active = true;
    let revealed = false;
    const started = performance.now();
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      document.documentElement.style.visibility = "";
    };
    const stop = () => {
      // 뒤로가기 제스처의 잔여 touchmove가 복원 직후 들어올 수 있다.
      // 안정화 전 입력은 공개 트리거로 취급하지 않는다.
      if (performance.now() - started < 900) return;
      active = false;
      reveal();
    };
    const restore = () => {
      if (!active) return;
      const card = document.querySelector<HTMLElement>(
        `[data-pid="${CSS.escape(saved!.photoId)}"]`
      );
      // 카드가 복구됐으면 클릭 당시 화면 내 위치에 정확히 맞추고,
      // 아직 없으면 우선 저장한 절대 좌표로 이동한다.
      const target = card
        ? window.scrollY + card.getBoundingClientRect().top - saved!.viewportTop
        : saved!.y;
      window.scrollTo(0, target);
      // Next 라우터가 커밋 뒤에도 늦게 scroll(0, 0)을 적용할 수 있으므로 카드가
      // 보인다는 이유만으로 즉시 공개하지 않는다. 최소 900ms 동안 계속 목표 위치를
      // 고정한 다음, 실제 좌표가 안정된 프레임에서만 화면을 공개한다.
      const elapsed = performance.now() - started;
      const settled = Math.abs(window.scrollY - target) <= 2;
      if (!revealed && elapsed >= 900 && settled) {
        requestAnimationFrame(reveal);
      }
      if (performance.now() - started < 3000) requestAnimationFrame(restore);
      else {
        active = false;
        reveal();
      }
    };

    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    window.addEventListener("keydown", stop);
    requestAnimationFrame(restore);

    return () => {
      active = false;
      reveal();
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [pathname]);

  return null;
}

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

    // 복원 위치가 확정되기 전 잠깐만 문서를 가려, 이전 상세 맨 위가 보였다가 내려가는
    // 플래시를 막는다. 단, 위치가 안정되는 즉시 공개해 뒤로가기 전환을 빠르게 한다.
    document.documentElement.style.visibility = "hidden";
    window.scrollTo(0, saved.y);

    let active = true;
    let revealed = false;
    let settledFrames = 0;
    const started = performance.now();
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      document.documentElement.style.visibility = "";
    };
    const stop = () => {
      // 뒤로가기 제스처의 잔여 입력만 짧게(250ms) 무시하고, 이후 사용자 스크롤은
      // 즉시 복원 중단 + 공개(사용자가 스크롤하려는 걸 막지 않게).
      if (performance.now() - started < 250) return;
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
      // 위치가 안정(문서가 충분히 길어져 target 도달)되면 '즉시' 공개 — 고정된 대기시간을
      // 두지 않아 전환이 빠르다. 공개 후에도 잠시 더 재보정해, Next 의 늦은 scroll(0,0)·
      // 이미지 로딩에 따른 이동을 다음 프레임에 바로잡는다(이미 보이는 상태라 눈에 안 띔).
      const settled = Math.abs(window.scrollY - target) <= 2;
      settledFrames = settled ? settledFrames + 1 : 0;
      if (!revealed && settledFrames >= 2) reveal();
      if (performance.now() - started < 1200) requestAnimationFrame(restore);
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

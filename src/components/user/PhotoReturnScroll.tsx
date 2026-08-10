"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

type PhotoReturn = {
  pathname: string;
  y: number;
  photoId: string;
  instanceId?: string;
  viewportTop: number;
};

const KEY = "samae:photo-return";
const RESTORING_KEY = "samae:feed-return-restoring";
const RESTORED_EVENT = "samae:feed-return-restored";

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
    if (!saved || saved.pathname !== pathname) {
      // 복원 도중 새로고침/탭 종료로 cleanup 이 실행되지 않은 경우의 잔여 플래그를 회수한다.
      if (sessionStorage.getItem(RESTORING_KEY)) {
        sessionStorage.removeItem(RESTORING_KEY);
        window.dispatchEvent(new Event(RESTORED_EVENT));
      }
      return;
    }
    sessionStorage.removeItem(storageKey);
    sessionStorage.setItem(RESTORING_KEY, String(Date.now()));

    // 복원 위치가 확정되기 전 잠깐만 문서를 가려, 이전 상세 맨 위가 보였다가 내려가는
    // 플래시를 막는다. 단, 위치가 안정되는 즉시 공개해 뒤로가기 전환을 빠르게 한다.
    document.documentElement.style.visibility = "hidden";
    window.scrollTo(0, saved.y);

    let active = true;
    let revealed = false;
    let settledFrames = 0;
    let observer: ResizeObserver | null = null;
    let observedCard: HTMLElement | null = null;
    const started = performance.now();
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      document.documentElement.style.visibility = "";
    };
    const finish = () => {
      if (!active) return;
      active = false;
      observer?.disconnect();
      sessionStorage.removeItem(RESTORING_KEY);
      window.dispatchEvent(new Event(RESTORED_EVENT));
      reveal();
    };
    const stop = () => {
      // 뒤로가기 제스처의 잔여 입력만 짧게(250ms) 무시하고, 이후 사용자 스크롤은
      // 즉시 복원 중단 + 공개(사용자가 스크롤하려는 걸 막지 않게).
      if (performance.now() - started < 250) return;
      finish();
    };
    const restore = () => {
      if (!active) return;
      const card = document.querySelector<HTMLElement>(
        saved!.instanceId
          ? `[data-feed-instance="${CSS.escape(saved!.instanceId)}"]`
          : `[data-pid="${CSS.escape(saved!.photoId)}"]`
      );
      if (card && card !== observedCard) {
        if (observedCard) observer?.unobserve(observedCard);
        observer?.observe(card);
        observedCard = card;
      }
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
      // Next의 늦은 스크롤 복원과 이미지·컬럼 크기 변화를 넉넉히 통과시킨다.
      // 사용자가 직접 스크롤하면 위 stop에서 즉시 종료되므로 조작을 가로막지 않는다.
      if (performance.now() - started < 3000) requestAnimationFrame(restore);
      else {
        finish();
      }
    };

    // 카드 자체뿐 아니라 메이슨리 전체 높이·폭이 바뀌는 경우에도 다음 프레임에서
    // 동일한 viewportTop으로 다시 맞춘다. RAF 보정과 함께 늦은 이미지 디코딩까지 포착한다.
    observer = new ResizeObserver(() => {
      settledFrames = 0;
    });
    const grid = document.querySelector<HTMLElement>("[data-feed-grid]");
    const initialCard = document.querySelector<HTMLElement>(
      saved.instanceId
        ? `[data-feed-instance="${CSS.escape(saved.instanceId)}"]`
        : `[data-pid="${CSS.escape(saved.photoId)}"]`
    );
    if (grid) observer.observe(grid);
    if (initialCard) {
      observer.observe(initialCard);
      observedCard = initialCard;
    }

    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    window.addEventListener("keydown", stop);
    requestAnimationFrame(restore);

    return () => {
      finish();
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [pathname]);

  return null;
}

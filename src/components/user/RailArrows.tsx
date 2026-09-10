"use client";

import { useEffect, useState, type RefObject } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/user/icons";

/**
 * 가로 레일용 좌우 화살표 — 데스크톱 전용.
 *
 * 이 프로젝트의 레일은 전부 네이티브 가로 스크롤(overflow-x:auto) 위에 얹혀 있고,
 * 스크롤바는 숨겨 뒀다. 폰에서는 손가락으로 밀면 되니 그걸로 충분한데
 * **데스크톱에는 밀 방법이 없다** — 마우스 휠은 세로만 굴리고, 드래그도 안 먹고,
 * 스크롤바까지 없으니 화면상 "안 움직이는 물건"이 된다.
 * (트랙패드 두 손가락은 되지만, 그걸 알아야 되는 건 조작이 아니라 비밀이다.)
 *
 * 그래서 sm~ 에서만 화살표를 세운다. 터치 기기에도 뜨지만 눌러도 잘 동작하므로
 * hover/pointer 미디어쿼리까지 끌어들이지 않는다 — 조건이 늘수록 안 뜨는 기기가 는다.
 *
 * 감싸는 쪽이 `relative` 여야 한다. 끝에 닿은 방향은 아예 렌더하지 않는다
 * (흐리게 두면 "눌리는데 반응이 없는 버튼"이 되어 더 나쁘다).
 */
export function RailArrows({
  targetRef,
  /** 한 번에 미는 거리(px). 없으면 보이는 폭의 80% */
  step,
  label = "레일",
}: {
  targetRef: RefObject<HTMLElement | null>;
  step?: number;
  /** aria-label 에 들어갈 대상 이름 — "장소 이전으로" 처럼 읽힌다 */
  label?: string;
}) {
  const [at, setAt] = useState({ start: true, end: true });

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    let raf = 0;
    const read = () => {
      raf = 0;
      const max = el.scrollWidth - el.clientWidth;
      // 1px 오차는 무시한다 — 소수점 폭 때문에 끝에 닿아도 max 에 정확히 안 맞는다
      setAt({ start: el.scrollLeft <= 1, end: el.scrollLeft >= max - 1 });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };

    read();
    el.addEventListener("scroll", onScroll, { passive: true });
    // 내용이 나중에 채워지거나(이미지 로드) 창이 바뀌면 끝 판정이 달라진다
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    window.addEventListener("resize", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [targetRef]);

  const go = (dir: -1 | 1) => {
    const el = targetRef.current;
    if (!el) return;
    el.scrollBy({
      left: dir * (step ?? el.clientWidth * 0.8),
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  // 밀 데가 아예 없으면(내용이 화면에 다 들어옴) 양쪽 다 안 그린다
  if (at.start && at.end) return null;

  const shell =
    "absolute top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-line bg-bg/92 text-fg shadow-card backdrop-blur transition-colors hover:border-brand hover:text-brand sm:grid";

  return (
    <>
      {!at.start && (
        <button
          type="button"
          aria-label={`${label} 이전으로`}
          onClick={() => go(-1)}
          className={`${shell} left-1`}
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
      )}
      {!at.end && (
        <button
          type="button"
          aria-label={`${label} 다음으로`}
          onClick={() => go(1)}
          className={`${shell} right-1`}
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      )}
    </>
  );
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  getSearchDockMode,
  getSearchDockRightInset,
  getSearchPillAppearance,
  getSearchDockSurface,
  type SearchDockMode,
  type SearchDockVariant,
  type SearchScrollDirection,
} from "@/lib/search-copy";
import { SearchPill } from "./SearchPill";

const SEARCH_DOCK_TOP_OFFSET_PX = 8;

/** 떠 있는 알약의 좌우 여백 — 지면 가로 패딩(px-2.5 / sm:px-4)과 같은 값 */
const FLOAT_GUTTER_PX = 10;
const FLOAT_GUTTER_SM_PX = 16;
/** 지면 폭 상한(max-w-screen-2xl)과 같게 — 넓은 모니터에서 검색창만 끝까지 늘어나지 않게 */
const FLOAT_MAX_W_PX = 1536;
/** 늘어나고 줄어드는 시간 */
const FLOAT_MS = 260;

/** 원래 검색창 하나를 홈·상세 화면 상단에 붙이고 표면만 전환한다. */
export function SearchDock({
  initial = "",
  placeholder,
  variant = "home",
  inline = false,
  back,
}: {
  initial?: string;
  placeholder: string;
  variant?: SearchDockVariant;
  /**
   * 검색창 왼쪽에 같은 줄로 세울 뒤로가기.
   *
   * 이게 없으면 detail 변형은 ml-12 로 왼쪽을 비운다 — 화면에 떠 있는 부유 버튼
   * (사진 상세용 검은 원)이 앉을 자리다. 밝은 지면(검색 결과)에서는 그 검은 원이
   * 겉돌아서, 버튼을 흐름 안으로 들여 같은 줄에 세운다. 그러면 비워 둘 자리도 없다.
   */
  back?: ReactNode;
  /**
   * 상단 한 줄(로고 ─ 검색 ─ 프로필) 안에 끼워 넣을 때.
   *
   * 줄 안에서는 `sticky` 가 안 먹는다 — 줄 자체가 56px 이라 붙어 있을 거리가 없다.
   * 그래서 **화면 밖으로 나가는 순간 `fixed` 로 갈아탄다.** 겉보기 동작은 예전
   * 검색창과 같다: 내려갈 때 투명해지고, 올리거나 누르면 다시 또렷해진다.
   *
   * 바깥 상자는 흐름에 그대로 남겨 둔다(자리만 지킨다) — 안쪽 알약만 떠오른다.
   * 상자까지 같이 띄우면 줄이 무너져 로고·프로필이 좌우로 튄다.
   */
  inline?: boolean;
}) {
  const markerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<SearchDockMode>("inline");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [scrollDirection, setScrollDirection] =
    useState<SearchScrollDirection>("idle");

  /*
    inline → floating 전환.

    떠오른 알약은 **전폭이어야 한다.** 줄에 있던 폭(~210px) 그대로 띄워 봤더니
    화면 한가운데 짧은 막대가 덩그러니 남아 더 어색했다(정훈 2026-09-12).
    문제는 목적지가 아니라 **가는 과정**이다 — `static` → `fixed` 는 CSS 가 이어 붙일
    수 없어서 210px 에서 370px 로 한 프레임에 '펑' 하고 벌어진다.

    그래서 두 걸음으로 간다.
      ① 떼는 순간: `fixed` + **줄에 있던 좌표·폭 그대로** (아직 안 움직인다)
      ② 다음 프레임: 전폭 목표로 좌표·폭을 바꾼다 → CSS 가 그 사이를 잇는다

    돌아올 때는 거꾸로 — 전폭에서 줄 자리까지 줄인 뒤에야 흐름으로 돌려놓는다.
    바로 돌려놓으면 커질 때와 똑같이 한 프레임에 튄다.

    `box` 는 줄에 있을 때의 자리다. 스크롤로는 안 바뀌므로 마운트·리사이즈 때만 잰다.
  */
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  /** 전폭일 때의 자리 — 뷰포트 폭에서 계산한다(리사이즈 때 갱신) */
  const [full, setFull] = useState<{ left: number; width: number } | null>(null);
  /** 지금 흐름에서 떨어져 떠 있나 — mode 보다 늦게 꺼진다(줄어드는 동안 떠 있어야 한다) */
  const [detached, setDetached] = useState(false);
  /** 떠 있는 동안의 목표 — 'slot' 은 줄에 있던 자리, 'full' 은 전폭 */
  const [geo, setGeo] = useState<"slot" | "full">("slot");

  useEffect(() => {
    let frame = 0;
    let previousScrollY = window.scrollY;

    const measureBox = () => {
      if (!inline) return;
      const el = markerRef.current;
      if (!el) return;
      // 떠 있는 동안에도 바깥 상자(자리지기)는 흐름에 남아 있다 — 그게 기준이다
      const r = el.getBoundingClientRect();
      setBox((prev) =>
        prev && Math.abs(prev.left - r.left) < 0.5 && Math.abs(prev.width - r.width) < 0.5
          ? prev
          : { left: r.left, width: r.width }
      );

      // 전폭 자리 — slot 과 **같은 속성(left/width)** 으로 표현해야 그 사이가 이어진다.
      // (left/right 로 두면 width 가 auto 라 보간되지 않아 전환이 통째로 안 걸린다)
      const vw = document.documentElement.clientWidth;
      const gutter = vw >= 640 ? FLOAT_GUTTER_SM_PX : FLOAT_GUTTER_PX;
      const w = Math.min(vw - gutter * 2, FLOAT_MAX_W_PX);
      setFull((prev) => {
        const next = { left: Math.round((vw - w) / 2), width: w };
        return prev && prev.left === next.left && prev.width === next.width ? prev : next;
      });
    };

    const updateMode = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const markerTop = markerRef.current?.getBoundingClientRect().top;
        if (markerTop == null) return;

        const nextScrollY = window.scrollY;
        const delta = nextScrollY - previousScrollY;
        if (delta > 1) setScrollDirection("down");
        else if (delta < -1) setScrollDirection("up");
        previousScrollY = nextScrollY;

        setMode(getSearchDockMode(markerTop, SEARCH_DOCK_TOP_OFFSET_PX));
      });
    };

    const onResize = () => {
      measureBox();
      updateMode();
    };

    measureBox();
    updateMode();
    window.addEventListener("scroll", updateMode, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateMode);
      window.removeEventListener("resize", onResize);
    };
  }, [inline]);

  /*
    떼고 붙이는 두 걸음. 여기서만 `detached`/`geo` 를 건드린다.

    ⚠️ rAF 한 번으로는 부족한 브라우저가 있다 — `fixed` 로 막 바뀐 프레임에 곧바로
       목표값을 넣으면 시작값이 아직 확정되지 않아 전환이 통째로 건너뛴다.
       두 프레임을 기다린 뒤 목표를 넣는다.
  */
  useEffect(() => {
    if (!inline) return;
    let f1 = 0;
    let f2 = 0;
    let timer = 0;

    if (mode === "floating") {
      // 1프레임: 흐름에서 떼되 **줄에 있던 자리 그대로** 놓는다(아직 안 움직인다)
      f1 = requestAnimationFrame(() => {
        setDetached(true);
        setGeo("slot");
        // 2프레임: 전폭으로. 시작값이 확정된 뒤라야 CSS 가 사이를 잇는다
        f2 = requestAnimationFrame(() => setGeo("full"));
      });
    } else {
      f1 = requestAnimationFrame(() => {
        // 되돌아가기 — 줄 자리까지 줄인 다음에야 흐름으로 돌려놓는다
        setGeo("slot");
        timer = window.setTimeout(() => setDetached(false), FLOAT_MS);
      });
    }

    return () => {
      cancelAnimationFrame(f1);
      cancelAnimationFrame(f2);
      window.clearTimeout(timer);
    };
  }, [mode, inline]);

  const detail = variant !== "home";
  const rightInset = getSearchDockRightInset(variant);
  const surface = getSearchDockSurface(mode, {
    hovered,
    focused,
    scrollDirection,
  });
  const appearance = getSearchPillAppearance(mode, surface, focused);

  return (
    <>
      {/* 기준점 — 이 위치가 상단선을 지나면 floating 으로 넘어간다.
          inline 일 때는 바깥 상자 자체가 기준점이다(따로 둘 자리가 없다). */}
      {!inline && <div ref={markerRef} aria-hidden="true" className="h-px" />}
      <div
        ref={inline ? markerRef : undefined}
        data-search-dock-mode={mode}
        data-search-dock-surface={surface}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={() => setFocused(false)}
        style={!inline && rightInset > 0 ? { marginRight: rightInset } : undefined}
        className={
          inline
            ? "relative min-w-0 flex-1"
            : `sticky top-2 z-30 ${
                back
                  ? "mx-auto flex max-w-screen-2xl items-center gap-2 px-1"
                  : detail
                    ? "ml-12"
                    : "mx-auto max-w-screen-2xl px-1"
              }`
        }
      >
        {back}
        <div
          className={
            back
              ? "min-w-0 flex-1"
              : /*
                   inline + 떠 있음 — 줄을 떠나 화면 위로 올라온다.
                   좌표·폭은 아래 style 이 정한다(slot → full 로 이어 달린다).
                */
                inline && detached
                ? "fixed top-2 z-40"
                : undefined
          }
          style={
            inline && detached
              ? {
                  ...((geo === "full" ? full : box) ?? full ?? {}),
                  /*
                    `left`/`width` 는 매 프레임 레이아웃을 다시 잡는 속성이다. 검색창
                    하나짜리라 실제로 버벅이진 않지만, 폭이 바뀌는 동안 안쪽 글자가
                    재배치되는 게 눈에 남지 않도록 짧게 끝낸다.
                  */
                  transition: `left ${FLOAT_MS}ms cubic-bezier(0.22,1,0.36,1), width ${FLOAT_MS}ms cubic-bezier(0.22,1,0.36,1)`,
                }
              : undefined
          }
        >
          <SearchPill
            initial={initial}
            placeholder={placeholder}
            surface={surface}
            appearance={appearance}
          />
        </div>
      </div>
      {!inline && (
        <div aria-hidden="true" className={detail ? "h-2 sm:h-3" : "h-3 sm:h-4"} />
      )}
    </>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { RecentPost } from "@/lib/explore-db";

const STEP_MS = 2800;
const ADVANCE_MS = 9600; // 가로 자동 넘김 주기(다음 카드로)
const PREVIEW_SHOTS = 5; // 카드에서 순환할 미리보기 장수(뷰어는 전체 사진)

type Rect = { left: number; top: number; width: number; height: number };

// 새로 올라온 스냅 레일 — 각 카드가 그 게시물 사진들을 sort_order 순으로 크로스페이드하며 순환.
// 카드를 탭하면 그 카드 위치에서 사진이 슈우웅 날아와 화면 전체로 커지는 뷰어(장바구니 fly 느낌).
export function RecentSnapsRail({ posts }: { posts: RecentPost[] }) {
  const [tick, setTick] = useState(0);
  const [viewer, setViewer] = useState<{ post: RecentPost; rect: Rect; start: number } | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  // 카드 내부 사진 크로스페이드
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setTick((t) => t + 1), STEP_MS);
    return () => clearInterval(id);
  }, []);

  // 가로 자동 넘김 — 다음 카드로 스크롤, 끝에 닿으면 처음으로 루프. (뷰어 열려 있으면 멈춤)
  useEffect(() => {
    if (viewer) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      const track = railRef.current;
      if (!track) return;
      const first = track.firstElementChild as HTMLElement | null;
      const step = first ? first.offsetWidth + 10 : track.clientWidth * 0.5; // 카드폭 + gap(2.5)
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      track.scrollTo({ left: atEnd ? 0 : track.scrollLeft + step, behavior: "smooth" });
    }, ADVANCE_MS);
    return () => clearInterval(id);
  }, [viewer]);

  // 뷰어 열림 동안 배경 스크롤 잠금
  useEffect(() => {
    if (!viewer) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
    };
  }, [viewer]);

  // 기기 뒤로가기로 '탐색탭 이탈'이 아니라 '뷰어만 닫힘'이 되도록 — 열릴 때 history 항목을 push 하고
  // popstate(뒤로가기)에서 뷰어를 닫는다. (뷰어는 오버레이라 원래 history 항목이 없어 뒤로가기가 페이지를 벗어났음)
  useEffect(() => {
    if (!viewer) return;
    window.history.pushState({ snapViewer: true }, "");
    const onPop = () => setViewer(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [viewer]);

  return (
    <div className="relative -mr-2.5 sm:-mr-4">
      <div
        ref={railRef}
        className="flex gap-2.5 overflow-x-auto pb-1 pl-1 pr-2.5 sm:pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {posts.map((post, i) => {
          // 카드는 앞쪽 미리보기 장만 순환(뷰어는 post.shots 전체를 보여줌)
          const preview = post.shots.slice(0, PREVIEW_SHOTS);
          const len = Math.max(1, preview.length);
          const active = (tick + i) % len;
          return (
            <button
              key={post.id}
              type="button"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setViewer({
                  post,
                  rect: { left: r.left, top: r.top, width: r.width, height: r.height },
                  start: active, // 지금 카드가 보여주던 사진부터
                });
              }}
              className="group relative aspect-[3/4] w-[54vw] max-w-72 shrink-0 overflow-hidden bg-fg/[0.06]"
            >
              {/* 사진 (앨범 순서대로 크로스페이드) */}
              <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04]">
                {preview.map((sh, si) => (
                  <Image
                    key={sh.id}
                    src={sh.url}
                    alt=""
                    fill
                    quality={80}
                    sizes="(max-width: 640px) 54vw, 288px"
                    className={cn(
                      "object-cover transition-opacity duration-[900ms]",
                      si === active ? "opacity-100" : "opacity-0"
                    )}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* 오른쪽 페이드 — 사진 끝(오른쪽)으로 갈수록 어둡게 + 살짝 모자이크(블러). 왼쪽 45% 까지는 효과 없음. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-black/70 backdrop-blur-[1px]"
        style={{
          maskImage: "linear-gradient(to right, transparent, transparent 45%, #000)",
          WebkitMaskImage: "linear-gradient(to right, transparent, transparent 45%, #000)",
        }}
      />

      {viewer && (
        <SnapViewer
          post={viewer.post}
          rect={viewer.rect}
          start={viewer.start}
          onClose={() => window.history.back()}
        />
      )}
    </div>
  );
}

// 풀스크린 스냅 뷰어 — 탭한 카드 rect 에서 화면 전체로 날아와 커짐(WAAPI, 장바구니 fly 느낌).
// 배경은 페이드 인, 챙(뒤로가기·카운터·도트)은 살짝 뒤에 나타남. 사진은 가로 스와이프.
function SnapViewer({
  post,
  rect,
  start,
  onClose,
}: {
  post: RecentPost;
  rect: Rect;
  start: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(start);
  const flyRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  // 현재 보고 있는(중앙) 사진 — 하단 버튼 대상
  const cur = post.shots[Math.min(idx, post.shots.length - 1)] ?? post.shots[0];

  // 카드 rect → 화면 전체 기준 시작 transform(중심 이동 + 카드 폭 배율)
  const from = useMemo(() => {
    const vw = window.innerWidth || 1;
    const vh = window.innerHeight || 1;
    const s = rect.width / vw;
    const dx = rect.left + rect.width / 2 - vw / 2;
    const dy = rect.top + rect.height / 2 - vh / 2;
    return `translate(${dx}px, ${dy}px) scale(${s})`;
  }, [rect]);

  // 커버플로 — 중앙에서 멀수록 슬라이드를 작게·흐리게(중앙은 크고 선명). 스크롤마다 갱신.
  const applyCoverflow = (el: HTMLElement) => {
    const center = el.scrollLeft + el.clientWidth / 2;
    Array.from(el.children).forEach((child) => {
      const s = child as HTMLElement;
      const t = Math.min(1, Math.abs(s.offsetLeft + s.offsetWidth / 2 - center) / s.offsetWidth);
      s.style.transform = `scale(${(1 - 0.18 * t).toFixed(3)})`;
      s.style.filter = `brightness(${(1 - 0.45 * t).toFixed(2)})`;
      s.style.opacity = (1 - 0.15 * t).toFixed(2);
    });
  };

  useLayoutEffect(() => {
    const fly0 = flyRef.current;
    if (fly0) {
      // 탭 시점 사진(start)으로 즉시 스크롤 위치 맞추기
      if (start > 0) {
        const slide = fly0.firstElementChild as HTMLElement | null;
        if (slide) fly0.scrollLeft = start * slide.offsetWidth;
      }
      applyCoverflow(fly0);
    }
    const easing = "cubic-bezier(.34,1.05,.3,1)";
    const fly = flyRef.current;
    const bd = backdropRef.current;
    const chrome = chromeRef.current;
    if (fly) {
      fly.style.transform = from; // 페인트 전 시작 위치 고정(깜빡임 방지)
      const a = fly.animate([{ transform: from }, { transform: "none" }], { duration: 440, easing });
      a.onfinish = () => (fly.style.transform = "none");
    }
    if (bd) {
      bd.style.opacity = "0";
      const a = bd.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: "ease-out" });
      a.onfinish = () => (bd.style.opacity = "1");
    }
    if (chrome) {
      chrome.style.opacity = "0";
      const a = chrome.animate(
        [{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1 }],
        { duration: 520, easing: "ease-out" }
      );
      a.onfinish = () => (chrome.style.opacity = "1");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 닫기 — 양옆(비중앙) 사진을 먼저 없앤 뒤, 중앙 사진만 원래 카드 위치로 줄어들며 돌아감.
  const handleClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    const easing = "cubic-bezier(.4,0,.9,.5)";
    const fly = flyRef.current;
    const bd = backdropRef.current;
    const chrome = chromeRef.current;

    // 1) 양옆(비중앙) 슬라이드를 부드럽게 페이드 아웃(WAAPI) + 챙 숨김
    if (fly) {
      const center = fly.scrollLeft + fly.clientWidth / 2;
      Array.from(fly.children).forEach((child) => {
        const s = child as HTMLElement;
        const t = Math.abs(s.offsetLeft + s.offsetWidth / 2 - center) / s.offsetWidth;
        if (t > 0.4) {
          const o = getComputedStyle(s).opacity;
          s.animate(
            [{ opacity: o }, { opacity: 0 }],
            { duration: 240, easing: "ease-out", fill: "forwards" }
          );
        }
      });
    }
    if (chrome) chrome.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" });

    // 2) 양옆이 자연스럽게 사라진 뒤 중앙 사진을 카드로 되돌림 + 배경 페이드
    window.setTimeout(() => {
      if (bd) bd.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, easing, fill: "forwards" });
      if (fly) {
        const a = fly.animate([{ transform: "none" }, { transform: from }], { duration: 300, easing, fill: "forwards" });
        a.onfinish = onClose;
      } else {
        onClose();
      }
    }, 210);
  };

  return (
    <div className="fixed inset-0 z-[70]">
      {/* 배경 — 검정 대신 뒤 화면을 모자이크처럼 블러(프로스트) + 살짝만 어둡게 */}
      <div ref={backdropRef} className="absolute inset-0 bg-black/35 backdrop-blur-[20px]" />

      {/* 날아와 커지는 사진(스와이프). 사진 밖(빈 영역) 탭 → 닫기 */}
      <div
        ref={flyRef}
        onClick={handleClose}
        onScroll={(e) => {
          const el = e.currentTarget;
          const slide = el.firstElementChild as HTMLElement | null;
          const w = slide ? slide.offsetWidth : el.clientWidth;
          setIdx(Math.round(el.scrollLeft / w));
          applyCoverflow(el);
        }}
        className="absolute inset-0 flex snap-x snap-mandatory overflow-x-auto px-[13vw] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {post.shots.map((sh) => (
          <div
            key={sh.id}
            className="flex h-full w-[74vw] max-w-[24rem] shrink-0 snap-center items-center justify-center px-1.5"
          >
            {/* 슬라이드가 화면보다 좁아 양옆 사진이 살짝 보인다(peek).
                이미지 요소를 실제 사진 크기에 맞춰(intrinsic) → 사진 밖(여백)은 어디든 탭하면 닫힘. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sh.url}
              alt=""
              draggable={false}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[74%] max-w-full select-none object-contain"
            />
          </div>
        ))}
      </div>

      {/* 챙 — 뒤로가기 / 카운터 / 도트 */}
      <div ref={chromeRef} className="pointer-events-none absolute inset-0 z-10">
        <button
          type="button"
          onClick={handleClose}
          aria-label="닫기"
          className="pointer-events-auto absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {post.shots.length > 1 && (
          <span className="absolute right-4 top-5 text-body-sm font-semibold text-white/80">
            {idx + 1} / {post.shots.length}
          </span>
        )}
        {/* 하단 — 도트 + 안내문 + (담기) · (사진 방문하기). 현재 보는 사진 기준. */}
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-6 pb-20 pt-6">
          {post.shots.length > 1 && (
            <div className="flex justify-center gap-1.5">
              {post.shots.map((sh, i) => (
                <span
                  key={sh.id}
                  className={cn(
                    "h-1.5 rounded-full bg-white transition-all duration-300",
                    i === idx ? "w-5 opacity-100" : "w-1.5 opacity-40"
                  )}
                />
              ))}
            </div>
          )}
          <p className="text-body font-semibold text-white drop-shadow">당신의 취향이신가요?</p>
          <div className="flex items-center gap-3">
            <Link
              href={`/photos/${cur.id}`}
              onClick={() => {
                // 사진 상세에서 뒤로 오면 '새로 올라온 스냅' 섹션이 상단 근처로 복원되도록
                // PhotoReturnScroll(레이아웃 상주, Router Cache 로 remount 안 돼도 동작)이 쓰는 키에 저장.
                // 요소(data-pid="sec-recent") 기준이라 잠금 중 window.scrollY 이슈와 무관.
                try {
                  sessionStorage.setItem(
                    "samae:photo-return",
                    JSON.stringify({ pathname: "/explore", y: 0, photoId: "sec-recent", viewportTop: 100 })
                  );
                } catch {
                  /* 무시 */
                }
              }}
              className="inline-flex items-center gap-1 rounded-full bg-brand px-4 py-1.5 text-body-sm font-semibold text-white shadow-lg transition-opacity hover:opacity-90"
            >
              사진 정보 보기
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

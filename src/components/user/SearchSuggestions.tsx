"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { NAV_FRESH_KEY } from "@/lib/nav-fresh";
import { searchHref, searchSessionStorageKeys } from "@/lib/search-navigation";
import { announceSearchPending } from "@/lib/search-pending";
import type { SearchSuggestion } from "@/lib/siglip-text-search-core";

/**
 * 연관 무드(사람 결정 2026-10-04, docs/47 §10) — 검색 결과 머리줄 바로 아래 한 줄, 그리고 위로 올려 떠오른 검색창 밑(SearchDock).
 *
 * 같은 큰 무드에 든 가족 이름이 **먼저**, 그 뒤에 비슷한 큰 무드 · 가족 몇 개. 버튼이 아니라 글자만, 큰 무드도 가족과 같은 색.
 * 누르면 그 말로 다시 검색한다(목적 말은 그대로 붙인다 — "비 오는 날 커플" 에서 잔잔한 → "잔잔한 커플").
 *
 * 누르면 **맨 위에서** 시작한다 — 다른 사진인데 보던 스크롤이 남아 있으면 안 된다(사람 요청).
 * 기록은 쌓지 않고 바꾼다(replace) — 연관 무드를 몇 번 눌러도 뒤로 가면 검색 전 화면(홈)으로 간다.
 * 모바일은 한 줄 가로 스크롤 — 줄이 늘어 사진을 밀어내지 않게.
 */

/** 역사다리꼴 — 윗변은 검색창 폭 그대로, 아랫변은 양쪽으로 이만큼 들어간다. 직사각형에 가까울 만큼 완만하게(사람 요청) */
const TAPER_PX = 6;
/** 아래 두 꼭짓점을 둥글게(사람 요청) — 검색창 모서리(rounded-md)와 같은 결 */
const CORNER_R = 8;

/**
 * 판 모양 — 윗변은 곧게(검색창에 붙는다), 아래 두 꼭짓점만 둥글린 역사다리꼴. 바탕 · clip-path 는 닫힌 길(fill),
 * 테두리는 **윗변을 뺀** 열린 길(edge) — 윗변은 검색창 아랫변 테두리와 겹쳐 두 줄로 보였다(사람 지적 2026-10-04).
 */
function panelPath(w: number, h: number): { fill: string; edge: string } {
  const top = 0;
  const bottom = h - 0.5;
  // 옆변 방향(위 → 아래)으로 CORNER_R 만큼 물러난 점에서 꼭짓점을 지나 아랫변으로 둥글게 꺾는다
  const len = Math.hypot(TAPER_PX, bottom - top);
  const dx = (TAPER_PX / len) * CORNER_R;
  const dy = ((bottom - top) / len) * CORNER_R;
  const r = (n: number) => Math.round(n * 100) / 100;
  const around = [
    `L${r(w - TAPER_PX + dx)} ${r(bottom - dy)}`, `Q${r(w - TAPER_PX)} ${r(bottom)} ${r(w - TAPER_PX - CORNER_R)} ${r(bottom)}`,
    `H${r(TAPER_PX + CORNER_R)}`,
    `Q${r(TAPER_PX)} ${r(bottom)} ${r(TAPER_PX - dx)} ${r(bottom - dy)}`,
  ];
  return {
    fill: [`M0 ${top}`, `H${r(w)}`, `L${r(w - 0.5)} ${top}`, ...around, `L0.5 ${top}`, "Z"].join(" "),
    edge: [`M${r(w - 0.5)} ${top}`, ...around, `L0.5 ${top}`].join(" "),
  };
}
export function SearchSuggestions({ items, floating = false, shown = true, active = false, traceTick = 0 }: {
  items: SearchSuggestion[];
  /** 떠 있는 검색창 밑에 붙은 판(SearchDock) */
  floating?: boolean;
  /** 판이 나와 있나 — 아니면 검색창 뒤로 올라가 숨는다 */
  shown?: boolean;
  /** 검색창을 눌렀다 — 판이 연한 회색으로 색을 갖는다 */
  active?: boolean;
  /** 검색창 빛이 출발할 때마다 1씩 는다(SearchDock 이 센다) — 그때 판 위로 은은한 은빛 광택이 한 번 스친다 */
  traceTick?: number;
}) {
  const router = useRouter();
  // 연관 무드로 다시 검색하는 동안 — 검색창 끝 고리가 돌게 알린다
  const [isPending, startTransition] = useTransition();
  useEffect(() => {
    announceSearchPending(isPending);
  }, [isPending]);
  const box = useRef<HTMLElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const shine = floating ? traceTick : 0;       // 광택이 지나간 횟수 — key 로 애니메이션을 다시 건다

  useLayoutEffect(() => {
    if (!floating || !box.current) return;
    const el = box.current;
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [floating]);

  if (!items.length) return null;

  function open(q: string) {
    try {
      // 그 검색어로 쌓였던 스크롤 · 피드 세션을 비우고, 이번 이동은 "새로 보러 감" 으로 표시한다(ScrollMemory 가 최상단에서 시작)
      searchSessionStorageKeys("/", q).forEach((key) => sessionStorage.removeItem(key));
      sessionStorage.setItem(NAV_FRESH_KEY, "/");
    } catch {
      /* 저장소가 막혀 있어도 이동은 한다 */
    }
    startTransition(() => router.replace(searchHref(q), { scroll: true }));
  }

  const colored = floating && active;
  const tone = floating && !colored;   // 반투명 회색 판 — 아직 색이 없다
  const list = (
    <>
      <span className={`relative shrink-0 text-[12px] font-semibold transition-colors duration-300 ${tone ? "text-white/60" : "text-muted"}`}>연관 무드</span>
      <ul className="scrollbar-none relative flex min-w-0 items-center gap-4 overflow-x-auto">
        {items.map((s) => (
          <li key={`${s.kind}-${s.label}`} className="shrink-0">
            <a href={searchHref(s.q)}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;   // 새 탭은 그대로
                event.preventDefault();
                open(s.q);
              }}
              className={`block text-[12px] font-medium underline-offset-2 transition-colors duration-300 hover:underline ${tone ? "text-white/85" : "text-fg"}`}>
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </>
  );

  if (!floating) {
    return <nav aria-label="연관 무드" className="mx-auto mb-3 flex max-w-screen-2xl items-center gap-4 px-1">{list}</nav>;
  }

  // 판 — 역사다리꼴. 바탕 블러는 clip-path 로 자르고, 바탕색 · 테두리 · 번쩍임은 같은 모양의 SVG 로 그린다
  const w = size?.w ?? 0;
  const h = size?.h ?? 0;
  const shape = w && h ? panelPath(w, h) : null;
  const outline = shape?.fill ?? "";
  return (
    <nav ref={box} aria-label="연관 무드" aria-hidden={!shown ? true : undefined} inert={!shown ? true : undefined}
      // 나오고 숨는 것은 위치(transform)로만 — 투명도를 같이 움직이면 그동안 뒤 배경 블러(backdrop-filter)가 꺼졌다가
      // 다 나온 뒤에야 켜져 중간에 '안 흐림 → 흐림' 으로 바뀌어 보였다(투명도 1 미만인 조상은 블러의 뒤를 끊는다, 사람 지적 2026-10-05).
      // 숨은 판은 감싼 상자(overflow-hidden, 검색창 바로 밑에서 시작)에 잘려 안 보이므로 투명도가 필요 없다
      className={`relative flex items-center gap-4 py-1.5 transition-transform ${
        shown
          ? "translate-y-0 duration-500 ease-[cubic-bezier(0.34,1.45,0.64,1)]"     // 내려올 때 — 검색창 뒤에서 툭 떨어져 살짝 튕긴다
          : "pointer-events-none -translate-y-[110%] duration-200 ease-in"}`}
      style={{ paddingLeft: TAPER_PX + 12, paddingRight: TAPER_PX + 12 }}>
      <span aria-hidden className="absolute inset-0 backdrop-blur-sm"
        style={outline ? { clipPath: `path("${outline}")` } : undefined} />
      {outline && (
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          <path d={outline} className={`stroke-none transition-[fill] duration-300 ${colored ? "samae-mood-panel-on" : "fill-neutral-400/30"}`} />
          <path d={shape!.edge} strokeLinejoin="round" strokeLinecap="round"
            className={`fill-none transition-[stroke] duration-300 ${colored ? "stroke-transparent" : "stroke-white/20"}`} />
        </svg>
      )}
      {/* 광택 — 검색창 빛이 돌 때 판 위로 은빛이 은은하게 한 번 스친다(빨간 띠 대신, 사람 요청 2026-10-05). 판 모양 밖으로는 안 나간다 */}
      {shine > 0 && outline && <span key={shine} aria-hidden className="samae-mood-shine" style={{ clipPath: `path("${outline}")` }} />}
      {list}
    </nav>
  );
}

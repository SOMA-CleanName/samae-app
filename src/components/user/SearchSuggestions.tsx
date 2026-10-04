"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { NAV_FRESH_KEY } from "@/lib/nav-fresh";
import { searchHref, searchSessionStorageKeys } from "@/lib/search-navigation";
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
/**
 * 검색창 빛(search-border-lap, 1500ms · cubic-bezier(0.22,1,0.36,1) · 90% 지점에서 한 바퀴)의 머리가
 * 검색창 **오른쪽 아래 꼭짓점**(둘레의 절반 = 이 판의 오른쪽 위 꼭짓점)에 닿는 때. 곡선을 풀어 구했다(≈177ms).
 */
const CORNER_MS = 177;
/** 검색창 높이(SearchPill h-[42px]) · 빛 길이(둘레의 14%) — 판 위 빛을 검색창 빛과 같은 자리 · 같은 속도로 맞추는 데 쓴다 */
const PILL_H = 42;
const TRACE_SHARE = 0.14;
/** 검색창 빛이 한 바퀴 도는 시간(1500ms 의 90% — 나머지 10% 는 사라지는 시간)과 곡선 */
const LAP_MS = 1350;
const LAP_EASE = [0.22, 1, 0.36, 1] as const;
/** 빛 머리가 판 왼쪽 끝에 닿은 뒤 띠가 판 밖으로 빠져나가는 시간 — 끝에서 느려져 남아 있지 않게(사람 요청) */
const EXIT_MS = 140;
/** 띠의 기울기 — tan(24°). 띠 아랫변이 윗변보다 판 높이 × 이만큼 왼쪽에 있다("/" 모양) */
const SLANT = 0.445;

/**
 * 판 위 대각선 빛의 출발 · 도착 자리(px). 검색창 빛(search-border-lap)과 **같은 길이 · 같은 곡선 · 같은 출발 시각**으로 돌리면
 * 빛 머리가 검색창 아랫변 위 어디에 있든 판 위 띠가 바로 그 아래에 있다 — 둘이 따로 노는 것처럼 보이지 않게(사람 지적 2026-10-04).
 * 검색창 둘레를 직사각형으로 보고, 진행률 u(0~1)에서 빛 머리는 둘레의 u, 아랫변은 둘레의 50% ~ 50%+w/둘레 구간이다.
 * 머리의 x 는 u 에 대해 1차라 CSS 키프레임(같은 곡선)으로 그대로 옮겨진다.
 */
function sweepFrames(w: number, h: number) {
  const perimeter = 2 * (w + PILL_H);
  const headX = (u: number) => w - (u * perimeter - (w + PILL_H));   // u=0.5 → 오른쪽 끝(w), 그 뒤 왼쪽으로
  const band = TRACE_SHARE * perimeter;
  const slant = Math.round(h * SLANT);
  // 띠의 왼쪽 끝(--sweep-l)을 머리에 맞춘다. 머리가 판 왼쪽 끝(x=0)에 닿을 때까지는 검색창 빛과 같은 곡선으로 따라가고,
  // 그 뒤에는 EXIT_MS 안에 띠 전체가 판 밖으로 빠져나간다 — 곡선 끝이 느려 띠가 왼쪽에 남던 것을 없앴다
  const frames: { offset: number; value: number }[] = [];
  let reach = LAP_MS;
  for (let t = 0; t <= LAP_MS; t += 15) {
    const x = headX(cubicBezier(LAP_EASE, t / LAP_MS));
    frames.push({ offset: t, value: Math.max(x, 0) });
    if (x <= 0) { reach = t; break; }
  }
  const total = reach + EXIT_MS;
  frames.push({ offset: total, value: -(band + 2) });
  return { band, slant, total, keyframes: frames.map((f) => ({ offset: f.offset / total, "--sweep-l": `${f.value}px` })) };
}

/** CSS cubic-bezier(x1, y1, x2, y2) 의 진행률 — 시간 비율 x(0~1) → 진행 y. 검색창 빛과 같은 곡선을 손으로 따라가려고 */
function cubicBezier([x1, y1, x2, y2]: readonly [number, number, number, number], x: number): number {
  const at = (t: number, a: number, b: number) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid, x1, x2) < x) lo = mid;
    else hi = mid;
  }
  return at((lo + hi) / 2, y1, y2);
}

export function SearchSuggestions({ items, floating = false, shown = true, active = false, traceTick = 0 }: {
  items: SearchSuggestion[];
  /** 떠 있는 검색창 밑에 붙은 판(SearchDock) */
  floating?: boolean;
  /** 판이 나와 있나 — 아니면 검색창 뒤로 올라가 숨는다 */
  shown?: boolean;
  /** 검색창을 눌렀다 — 빛이 판에 닿는 순간 색을 갖는다 */
  active?: boolean;
  /** 검색창 빛이 출발할 때마다 1씩 는다(SearchDock 이 센다) — 판은 따로 돌지 않고, 꼭짓점에 닿을 때 대각선 빛이 판을 쓸고 지나간다 */
  traceTick?: number;
}) {
  const router = useRouter();
  const box = useRef<HTMLElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [lit, setLit] = useState(false);        // 눌러서 빛을 한 번 받았다 → 그 뒤로는 누를 때마다 색을 갖는다(검색창 빛은 처음 한 번만 돈다)
  const flash = floating ? traceTick : 0;       // 빛이 지나간 횟수 — key 로 애니메이션을 다시 건다
  const [sweeping, setSweeping] = useState(false);   // 빛이 판을 지나는 동안 — 판은 흰 바탕 · 검은 글자, 띠 아래 글자는 흰색
  const listRef = useRef<HTMLUListElement>(null);
  const ghostRef = useRef<HTMLUListElement>(null);   // 띠 아래 흰 글자 — 가로 스크롤을 본 목록과 맞춘다
  const runRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!floating || !box.current) return;
    const el = box.current;
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [floating]);

  // 검색창 빛이 꼭짓점에 닿을 때 판 위로 대각선 빛이 지나간다 — 눌러서 생긴 빛이면 그때 색을 갖는다
  useEffect(() => {
    if (!floating || !traceTick) return;
    // 빛은 검색창 빛과 같은 순간에 출발한다(판 밖에서 기다리다 꼭짓점에서 들어온다)
    if (ghostRef.current && listRef.current) ghostRef.current.scrollLeft = listRef.current.scrollLeft;
    const timer = window.setTimeout(() => {
      setSweeping(true);                          // 꼭짓점에 닿았다 — 흰 판 · 검은 글자로
      if (active) setLit(true);
    }, CORNER_MS);
    const total = size ? sweepFrames(size.w, size.h).total : LAP_MS;
    const done = window.setTimeout(() => setSweeping(false), total);   // 빛이 빠져나가면 원래 모습으로
    return () => { window.clearTimeout(timer); window.clearTimeout(done); };
  }, [floating, traceTick]);   // eslint-disable-line react-hooks/exhaustive-deps -- 출발 순간의 active 만 본다

  // 띠를 움직인다 — 계산한 키프레임(sweepFrames)으로. --sweep-l 은 @property 로 길이로 등록돼 있어 사이가 이어진다
  useEffect(() => {
    const el = runRef.current;
    if (!flash || !el || !size) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const f = sweepFrames(size.w, size.h);
    const anim = el.animate(f.keyframes, { duration: f.total, easing: "linear", fill: "forwards" });
    return () => anim.cancel();
  }, [flash]);   // eslint-disable-line react-hooks/exhaustive-deps -- 빛이 출발할 때 한 번

  if (!items.length) return null;

  function open(q: string) {
    try {
      // 그 검색어로 쌓였던 스크롤 · 피드 세션을 비우고, 이번 이동은 "새로 보러 감" 으로 표시한다(ScrollMemory 가 최상단에서 시작)
      searchSessionStorageKeys("/", q).forEach((key) => sessionStorage.removeItem(key));
      sessionStorage.setItem(NAV_FRESH_KEY, "/");
    } catch {
      /* 저장소가 막혀 있어도 이동은 한다 */
    }
    window.scrollTo(0, 0);
    router.replace(searchHref(q), { scroll: true });
  }

  const colored = floating && active && lit;
  const tone = floating && !colored && !sweeping;   // 반투명 회색 판 — 아직 색이 없다
  const ink = sweeping ? "text-black" : null;        // 빛이 지나는 동안 — 흰 판 위 검은 글자
  const list = (
    <>
      <span className={`relative shrink-0 text-[12px] font-semibold transition-colors duration-300 ${ink ?? (tone ? "text-white/60" : "text-muted")}`}>연관 무드</span>
      <ul ref={listRef} onScroll={(e) => { if (ghostRef.current) ghostRef.current.scrollLeft = e.currentTarget.scrollLeft; }}
        className="scrollbar-none relative flex min-w-0 items-center gap-4 overflow-x-auto">
        {items.map((s) => (
          <li key={`${s.kind}-${s.label}`} className="shrink-0">
            <a href={searchHref(s.q)}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;   // 새 탭은 그대로
                event.preventDefault();
                open(s.q);
              }}
              className={`block text-[12px] font-medium underline-offset-2 transition-colors duration-300 hover:underline ${ink ?? (tone ? "text-white/85" : "text-fg")}`}>
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
  const f = w && h ? sweepFrames(w, h) : null;
  return (
    <nav ref={box} aria-label="연관 무드" aria-hidden={!shown ? true : undefined} inert={!shown ? true : undefined}
      className={`relative flex items-center gap-4 py-1.5 transition-[transform,opacity] ${
        shown
          ? "translate-y-0 opacity-100 duration-500 ease-[cubic-bezier(0.34,1.45,0.64,1)]"     // 내려올 때 — 검색창 뒤에서 툭 떨어져 살짝 튕긴다
          : "pointer-events-none -translate-y-full opacity-0 duration-200 ease-in"}`}
      style={{ paddingLeft: TAPER_PX + 12, paddingRight: TAPER_PX + 12 }}>
      <span aria-hidden className="absolute inset-0 backdrop-blur-sm"
        style={outline ? { clipPath: `path("${outline}")` } : undefined} />
      {outline && (
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          <path d={outline} className={`stroke-none transition-[fill] duration-300 ${sweeping ? "fill-white" : colored ? "samae-mood-panel-on" : "fill-neutral-400/30"}`} />
          <path d={shape!.edge} strokeLinejoin="round" strokeLinecap="round"
            className={`fill-none transition-[stroke] duration-300 ${colored || sweeping ? "stroke-transparent" : "stroke-white/20"}`} />
        </svg>
      )}
      {/*
        빛 — 검색창 빛이 꼭짓점에 닿으면 같은 빨강의 대각선 띠가 판을 오른쪽에서 왼쪽으로 쓸고 지나간다(검색창 아랫변 빛 바로 아래).
        띠와 "띠 아래 흰 글자" 는 같은 --sweep-l(띠 왼쪽 끝)을 함께 따라간다 — 띠가 지나는 글자만 흰색으로 뒤집힌다.
      */}
      {flash > 0 && outline && f && (
        <span key={flash} ref={runRef} aria-hidden className="samae-mood-run pointer-events-none absolute inset-0 z-[2]"
          style={{ clipPath: `path("${outline}")`, "--sweep-w": `${f.band}px`, "--sweep-l": `${w}px`, "--sweep-s": `${f.slant}px` } as CSSProperties}>
          <span className="samae-mood-band absolute inset-0" />
          <span className="samae-mood-band-clip absolute inset-0 flex items-center gap-4 py-1.5" style={{ paddingLeft: TAPER_PX + 12, paddingRight: TAPER_PX + 12 }}>
            <span className="shrink-0 text-[12px] font-semibold text-white">연관 무드</span>
            <ul ref={ghostRef} className="scrollbar-none flex min-w-0 items-center gap-4 overflow-x-hidden">
              {items.map((s) => <li key={`${s.kind}-${s.label}`} className="shrink-0 text-[12px] font-medium text-white">{s.label}</li>)}
            </ul>
          </span>
        </span>
      )}
      {list}
    </nav>
  );
}

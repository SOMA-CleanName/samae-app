"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CartItem } from "./CartProvider";
import type { InterestRecommendationRow } from "@/lib/interest-similar-recommendations";

// 관심사진 '비슷한 사진' 화면 — 앵커별 가로 스크롤 줄.
//
// 관심사진 화면의 폴라로이드 배치를 재사용하지 않는다. 두 화면의 일이 다르다.
// 관심사진은 '내가 고른 것'이라 애착의 대상이고 흩뿌린 폴라로이드가 그 정서를 살리지만,
// 이 화면은 훑어보고 고르는 곳이라 비교가 쉬워야 한다. 기울어진 카드는 비교를 방해하고,
// 폴라로이드 흰 테두리가 카드 면적의 20% 가까이를 먹는다. (docs/26 §2)
//
// 줄 왼쪽에 담은 사진을 붙이는 것이 이 화면의 핵심이다. 그게 없으면 사용자는
// "무엇과 비슷하다는 거지?" 를 알 수 없다.

// 줄 안에서는 **높이를 고정하고 폭을 비율대로 늘린다.**
// 폭을 고정하면 가로 사진이 납작해져 세로 사진보다 훨씬 작게 보인다. 필름 스트립처럼
// 높이를 맞추면 가로 사진이 넓어지며 면적을 회복하고, 줄의 아래위 선도 가지런해진다.
const ROW_H = 150;
// 파노라마가 줄을 독차지하거나 극단적 세로가 실오라기처럼 얇아지는 것만 막는다.
const MIN_W = 84;
const MAX_W = 260;

function cardWidth(w: number, h: number) {
  if (w <= 0 || h <= 0) return 104;
  return Math.round(Math.min(MAX_W, Math.max(MIN_W, ROW_H * (w / h))));
}

export function InterestSimilarRows({
  rows,
  onAdd,
  isAdded,
  zoomed,
  onZoomChange,
}: {
  rows: InterestRecommendationRow[];
  onAdd: (item: CartItem, sourceEl: HTMLElement | null) => void;
  isAdded: (id: string) => boolean;
  // 확대 상태는 상위가 들고 있다. 헤더 뒤로가기가 '확대 → 줄 → 관심사진' 순서로
  // 한 단계씩 물러나야 하는데, 이 안에 가둬두면 헤더가 확대 여부를 알 수 없다.
  zoomed: CartItem | null;
  onZoomChange: (card: CartItem | null) => void;
}) {
  const setZoomed = onZoomChange;

  return (
    <>
      <div className="flex flex-col gap-7 pb-2 pt-1">
        {rows.map((row) => (
          <section key={row.anchor.id} aria-label="담은 사진과 비슷한 사진">
            <header className="flex items-center gap-2.5 px-4 pb-2">
              <img
                src={row.anchor.src}
                alt="담은 사진"
                className="h-10 w-10 flex-none rounded-md border-2 border-white/85 object-cover"
                draggable={false}
              />
              <p className="min-w-0 text-[13px] font-bold leading-tight text-white">
                이 사진과 비슷한
              </p>
            </header>

            <Strip
              cards={row.cards}
              onZoom={setZoomed}
              onAdd={onAdd}
              isAdded={isAdded}
            />
          </section>
        ))}
      </div>

      {zoomed && (
        <ZoomView
          card={zoomed}
          added={isAdded(zoomed.id)}
          onClose={() => setZoomed(null)}
          onAdd={onAdd}
        />
      )}
    </>
  );
}

// 가로 스크롤 줄 — 관심 없는 줄은 지나치면 된다. 세로로 쌓지 않는 이유다.
function Strip({
  cards,
  onZoom,
  onAdd,
  isAdded,
}: {
  cards: CartItem[];
  onZoom: (card: CartItem) => void;
  onAdd: (item: CartItem, sourceEl: HTMLElement | null) => void;
  isAdded: (id: string) => boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // 오른쪽 끝을 덮는 페이드로 "더 있다" 를 알린다. 다만 넘길 것이 없을 때 덮으면
  // 없는 콘텐츠를 약속하는 셈이므로, 넘칠 때만 그리고 끝에 닿으면 지운다.
  const [more, setMore] = useState(false);

  const sync = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 8);
  }, []);

  useLayoutEffect(() => {
    sync();
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sync, cards.length]);

  return (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={sync}
        className="flex snap-x snap-proximity items-start gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((card) => (
          <RowCard
            key={card.id}
            card={card}
            onZoom={onZoom}
            onAdd={onAdd}
            added={isAdded(card.id)}
          />
        ))}
      </div>

      <div
        aria-hidden="true"
        className={`pointer-events-none absolute right-0 top-0 w-16 bg-gradient-to-l from-black/85 via-black/35 to-transparent transition-opacity duration-200 ${
          more ? "opacity-100" : "opacity-0"
        }`}
        style={{ height: ROW_H }}
      />
    </div>
  );
}

function RowCard({
  card,
  onZoom,
  onAdd,
  added,
}: {
  card: CartItem;
  onZoom: (card: CartItem) => void;
  onAdd: (item: CartItem, sourceEl: HTMLElement | null) => void;
  added: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const width = cardWidth(card.w, card.h);

  return (
    <div ref={frame} className="relative flex-none snap-start" style={{ width }}>
      <button
        type="button"
        // 전파를 끊는다. FloatingCart 의 카드 레이어는 빈 영역 탭을 '오버레이 닫기'로
        // 처리하므로(layerClick → dismissOverlay), 그냥 두면 카드 탭이 닫기로 먹힌다.
        onClick={(e) => {
          e.stopPropagation();
          onZoom(card);
        }}
        aria-label="사진 크게 보기"
        className="block w-full overflow-hidden rounded-lg bg-white/5"
        style={{ height: ROW_H }}
      >
        <img
          src={card.src}
          alt=""
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover"
        />
      </button>

      {/* 담기 — 확대를 거치지 않고 훑는 중에 바로 담을 수 있어야 한다.
          담을수록 추천이 정확해지는 루프가 여기서 생긴다. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (added) return;
          onAdd(card, frame.current);
        }}
        aria-label={added ? "이미 담긴 사진" : "관심사진에 담기"}
        aria-pressed={added}
        className={`absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full text-[13px] font-bold leading-none text-white backdrop-blur-sm transition-colors ${
          added ? "bg-brand" : "bg-black/55 hover:bg-black/75"
        }`}
      >
        {added ? "✓" : "+"}
      </button>
    </div>
  );
}

// 확대 보기 — 관심사진 확대(FloatingCart focused)와 같은 시각 언어를 쓴다.
// 사진은 화면 높이의 64%를 넘지 않게 두고, 빈 영역 탭은 닫기로 전달된다.
function ZoomView({
  card,
  added,
  onClose,
  onAdd,
}: {
  card: CartItem;
  added: boolean;
  onClose: () => void;
  onAdd: (item: CartItem, sourceEl: HTMLElement | null) => void;
}) {
  const imgWrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ratio = card.w > 0 && card.h > 0 ? card.h / card.w : 1.4;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-black/85 px-5 backdrop-blur-sm"
      // 빈 영역 탭 = 닫기. 단 아래 카드 레이어까지 전파되면 오버레이 자체가 닫히므로 끊는다.
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="사진 크게 보기"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="absolute right-4 top-4 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>

      <div
        ref={imgWrap}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[64svh] w-full max-w-md overflow-hidden rounded-2xl"
        style={{ aspectRatio: `1 / ${ratio.toFixed(3)}` }}
      >
        <img src={card.src} alt="" className="h-full w-full object-contain" draggable={false} />
      </div>

      {/* 이 화면에서 사진 상세로 나가는 경로는 두지 않는다.
          나갔다 브라우저 뒤로 오면 오버레이가 닫힌 홈으로 떨어져 400장 보던 자리를
          잃는다. 상세는 관심사진에 담은 뒤 그쪽에서 열게 한다. */}
      <div
        className="flex w-full max-w-md items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            if (added) return;
            onAdd(card, imgWrap.current);
          }}
          aria-pressed={added}
          className={`h-12 flex-1 cursor-pointer rounded-full text-sm font-bold text-white transition-colors ${
            added ? "bg-brand" : "bg-brand hover:brightness-110"
          }`}
        >
          {added ? "담았어요" : "관심사진에 담기"}
        </button>
      </div>
    </div>
  );
}

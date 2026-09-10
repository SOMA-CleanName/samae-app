"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { cartCardJitter, type CartItem } from "./CartProvider";
import {
  UNKNOWN_PHOTOGRAPHER,
  groupDisplayName,
  groupInquiryPhotoId,
  groupPriceText,
  rowItems,
  type CartGroup,
} from "@/lib/cart-photographer-groups";

// 관심사진 — 작가 한 명이 한 줄. 줄 안은 가로 스크롤.
//
// 흩뿌린 폴라로이드를 한 화면에 펼치던 배치를 대신한다. 사진이 쌓일수록
// "누구에게 문의할지" 가 실제 다음 행동인데, 작가가 섞여 있으면 그 판단을
// 사용자가 매번 눈으로 다시 해야 했다. 줄로 갈라 두면 작가가 곧 목차가 된다.
//
// 줄 안에서는 InterestSimilarRows 와 같은 규칙 — **높이를 고정하고 폭을 비율대로**.
// 폭을 고정하면 가로 사진이 납작해져 세로 사진보다 훨씬 작게 보인다.
const ROW_H = 168;
const MIN_W = 92;
const MAX_W = 268;
const FRAME_SIDE = 6; // 폴라로이드 흰 테두리(좌우·위)
const FRAME_BOTTOM = 18; // 아래는 두껍게

function photoWidth(w: number, h: number) {
  if (w <= 0 || h <= 0) return 116;
  return Math.round(Math.min(MAX_W, Math.max(MIN_W, ROW_H * (w / h))));
}

// 카드마다 살짝 다른 기울기 — 도크 더미와 같은 해시를 써서 같은 사진은 늘 같은 각도.
function cardRotation(id: string) {
  return (cartCardJitter(id).rot % 5) - 2; // -2 ~ 2도
}

export function CartPhotographerRows({
  groups,
  selectMode,
  selectedIds,
  onToggleSelect,
  onLongPress,
  onOpenPhoto,
  onInquiry,
}: {
  groups: CartGroup[];
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onLongPress: (id: string) => void;
  // 확대는 상위(FloatingCart)가 자기 카드 레이어로 연다 — 누른 카드의 화면 위치를 같이 넘겨
  // 그 자리에서 커지도록.
  onOpenPhoto: (item: CartItem, from: HTMLElement | null) => void;
  onInquiry: (group: CartGroup, photoId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-7 pb-32 pt-16">
      {groups.map((group, gi) => {
        const inquiryPhotoId = groupInquiryPhotoId(group);
        const priceText = groupPriceText(group);
        return (
          <section key={group.photographerId} aria-label={`${groupDisplayName(group)} 관심 사진`}>
            <header className="flex items-center gap-2 px-4 pb-2.5">
              <p className="min-w-0 truncate text-[15px] font-bold leading-tight text-white">
                {groupDisplayName(group)}
              </p>
              {/* 최소 촬영 패키지 금액 — '이 작가에게 맡기면 얼마부터' 를 이름 옆에서 바로. */}
              {priceText && (
                <span className="shrink-0 text-xs font-semibold text-white/75">{priceText}</span>
              )}
              <span className="shrink-0 text-xs text-white/45">{group.items.length}장</span>
              <span className="flex-1" />
              {/* 작가 미상 줄은 문의할 상대가 없다 — 버튼을 두지 않는다. */}
              {group.photographerId !== UNKNOWN_PHOTOGRAPHER && inquiryPhotoId && !selectMode && (
                // 사진 상세의 '무료로 견적 받아보기'와 같은 Meta Lead 전환(data-quote-lead).
                <button
                  type="button"
                  data-quote-lead=""
                  onClick={(e) => {
                    e.stopPropagation();
                    onInquiry(group, inquiryPhotoId);
                  }}
                  className="shrink-0 cursor-pointer rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-white shadow-pop transition-opacity hover:opacity-90"
                >
                  문의하기
                </button>
              )}
            </header>

            <Strip
              items={rowItems(group)}
              rowIndex={gi}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              onLongPress={onLongPress}
              onOpenPhoto={onOpenPhoto}
            />
          </section>
        );
      })}
    </div>
  );
}

// 가로 스크롤 줄 — 관심 없는 작가의 줄은 지나치면 된다.
function Strip({
  items,
  rowIndex,
  selectMode,
  selectedIds,
  onToggleSelect,
  onLongPress,
  onOpenPhoto,
}: {
  items: CartItem[];
  rowIndex: number;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onLongPress: (id: string) => void;
  onOpenPhoto: (item: CartItem, from: HTMLElement | null) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // 오른쪽 끝을 덮는 페이드로 "더 있다" 를 알린다. 넘길 것이 없으면 덮지 않는다.
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
  }, [sync, items.length]);

  return (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={sync}
        className="flex snap-x snap-proximity items-start gap-2.5 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <RowCard
            key={item.id}
            item={item}
            delayMs={Math.min(rowIndex * 60 + i * 34, 520)}
            selectMode={selectMode}
            selected={selectedIds.has(item.id)}
            onToggleSelect={onToggleSelect}
            onLongPress={onLongPress}
            onOpenPhoto={onOpenPhoto}
          />
        ))}
      </div>

      <div
        aria-hidden="true"
        className={`pointer-events-none absolute right-0 top-0 w-14 bg-gradient-to-l from-black/85 via-black/35 to-transparent transition-opacity duration-200 ${
          more ? "opacity-100" : "opacity-0"
        }`}
        style={{ height: ROW_H + FRAME_SIDE + FRAME_BOTTOM + 8 }}
      />
    </div>
  );
}

const LONG_PRESS_MS = 420;

function RowCard({
  item,
  delayMs,
  selectMode,
  selected,
  onToggleSelect,
  onLongPress,
  onOpenPhoto,
}: {
  item: CartItem;
  delayMs: number;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onLongPress: (id: string) => void;
  onOpenPhoto: (item: CartItem, from: HTMLElement | null) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  // 길게 누르기 → 선택 모드. 폴라로이드 펼침 화면에서 하던 동작을 그대로 가져온다.
  const press = useRef<{ timer: number | null; fired: boolean; x: number; y: number }>({
    timer: null,
    fired: false,
    x: 0,
    y: 0,
  });
  const width = photoWidth(item.w, item.h);

  function clearPress() {
    if (press.current.timer != null) {
      window.clearTimeout(press.current.timer);
      press.current.timer = null;
    }
  }

  return (
    <div
      ref={frame}
      className="cart-row-card relative flex-none snap-start bg-white shadow-[0_10px_28px_rgba(0,0,0,0.4)]"
      style={{
        padding: `${FRAME_SIDE}px ${FRAME_SIDE}px ${FRAME_BOTTOM}px`,
        borderRadius: 3,
        rotate: `${cardRotation(item.id)}deg`,
        animationDelay: `${delayMs}ms`,
        // 등장 애니메이션이 opacity 를 채우고 있어(fill: both) 인라인 opacity 는 먹지 않는다.
        // 고르지 않은 카드는 밝기로 물린다.
        filter: selectMode && !selected ? "brightness(0.5)" : "none",
        transition: "filter 160ms ease",
      }}
    >
      <button
        type="button"
        // 전파를 끊는다. FloatingCart 의 카드 레이어는 빈 영역 탭을 '오버레이 닫기'로
        // 처리하므로(layerClick → dismissOverlay), 그냥 두면 카드 탭이 닫기로 먹힌다.
        onClick={(e) => {
          e.stopPropagation();
          if (press.current.fired) {
            press.current.fired = false;
            return;
          }
          if (selectMode) onToggleSelect(item.id);
          else onOpenPhoto(item, frame.current);
        }}
        onPointerDown={(e) => {
          if (selectMode) return;
          press.current = { timer: null, fired: false, x: e.clientX, y: e.clientY };
          press.current.timer = window.setTimeout(() => {
            press.current.fired = true;
            onLongPress(item.id);
            navigator.vibrate?.(15); // 햅틱(지원 기기만)
          }, LONG_PRESS_MS);
        }}
        onPointerMove={(e) => {
          // 가로 스크롤 중이면 롱프레스 취소 — 줄을 넘기다 선택 모드로 빠지지 않게.
          const p = press.current;
          if (p.timer != null && (Math.abs(e.clientX - p.x) > 8 || Math.abs(e.clientY - p.y) > 8)) {
            clearPress();
          }
        }}
        onPointerUp={clearPress}
        onPointerCancel={clearPress}
        // 롱프레스 시 브라우저 기본 메뉴(이미지 공유·저장) 차단 — 선택 모드만 발동되게.
        onContextMenu={(e) => e.preventDefault()}
        aria-label={selectMode ? "선택/해제" : "크게 보기"}
        className="block cursor-pointer select-none overflow-hidden bg-fg/10"
        style={{ width, height: ROW_H, borderRadius: 1 }}
      >
        <img
          src={item.src}
          alt=""
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover"
        />
      </button>

      {selectMode && (
        <span
          style={{ top: FRAME_SIDE + 4, right: FRAME_SIDE + 4 }}
          className={`pointer-events-none absolute grid h-6 w-6 place-items-center rounded-full border-2 ${
            selected ? "border-brand bg-brand text-white" : "border-white bg-black/25 text-transparent"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </div>
  );
}

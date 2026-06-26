"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// 장바구니 — 완전 비로그인 기준이라 localStorage 에만 저장.
// 담을 때 사진이 하단 우측 장바구니로 "빨려들어가는" 모션이 핵심.

export type CartItem = { id: string; src: string; w: number; h: number };

type CartContextValue = {
  items: CartItem[];
  has: (id: string) => boolean;
  add: (item: CartItem, sourceEl?: HTMLElement | null) => void;
  remove: (id: string) => void;
  clear: () => void;
  count: number;
  // FloatingCart 가 자신을 fly 도착 지점으로 등록(현재 미사용, 호환 유지)
  registerTarget: (el: HTMLElement | null) => void;
  // 방금 담은 카드의 출발 사진 위치(FLIP 용) — 소비하면 제거
  consumeFlyFrom: (id: string) => DOMRect | null;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "samae:cart";

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const targetRef = useRef<HTMLElement | null>(null);
  // 담은 직후 카드가 출발 사진 자리에서 제자리로 날아오게(FLIP) — id별 출발 rect 보관
  const flyFromRef = useRef<Map<string, DOMRect>>(new Map());

  // 최초 로드
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* 손상된 값 무시 */
    }
    setHydrated(true);
  }, []);

  // 변경 시 저장
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* 용량 초과 등 무시 */
    }
  }, [items, hydrated]);

  const registerTarget = useCallback((el: HTMLElement | null) => {
    targetRef.current = el;
  }, []);

  const pushItem = useCallback((item: CartItem) => {
    setItems((prev) => (prev.some((p) => p.id === item.id) ? prev : [...prev, item]));
  }, []);

  // 담기 — sourceEl 의 사진 위치를 출발점으로 기록하고 바로 추가.
  // FloatingCart 가 새 카드를 그 출발점에서 제자리로 FLIP 시켜 끊김 없이 안착시킨다.
  const add = useCallback(
    (item: CartItem, sourceEl?: HTMLElement | null) => {
      // 장바구니 담기 = 전환 행동 → A11 혜택 hook 더 이상 안 띄움
      try {
        localStorage.setItem("samae:hooked", "1");
      } catch {
        /* 무시 */
      }
      if (sourceEl && typeof document !== "undefined") {
        const r = sourceEl.getBoundingClientRect();
        if (r.width > 0) flyFromRef.current.set(item.id, r);
      }
      pushItem(item);
    },
    [pushItem]
  );

  const consumeFlyFrom = useCallback((id: string) => {
    const r = flyFromRef.current.get(id);
    if (r) flyFromRef.current.delete(id);
    return r ?? null;
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }, []);
  const clear = useCallback(() => setItems([]), []);
  const has = useCallback((id: string) => items.some((p) => p.id === id), [items]);

  return (
    <CartContext.Provider
      value={{ items, has, add, remove, clear, count: items.length, registerTarget, consumeFlyFrom }}
    >
      {children}
    </CartContext.Provider>
  );
}

// 폴라로이드 프레임 치수 — 사진 영역 너비 + 흰 여백(하단이 두껍게). 미리보기·fly 공용.
export const PEEK_FRAME = { photoW: 56, side: 4, top: 4, bottom: 12 };
export const PEEK_CARD_W = PEEK_FRAME.photoW + PEEK_FRAME.side * 2; // 64

// 카드별 흐트러진 더미 변형 — id 해시로 각도·위치를 결정(고정). 타이트하게(폴라로이드 더미).
// FloatingCart 의 쌓인 카드와 fly 클론 착지 각도를 같은 값으로 맞추는 데 공용.
export function cartCardJitter(id: string): { rot: number; dx: number; dy: number } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return {
    rot: (h % 17) - 8, // -8 ~ 8도(타이트)
    dx: ((h >> 5) % 11) - 5, // -5 ~ 5px
    dy: ((h >> 9) % 9) - 4, // -4 ~ 4px
  };
}


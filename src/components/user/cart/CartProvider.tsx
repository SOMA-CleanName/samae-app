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
  // FloatingCart 가 자신을 fly 도착 지점으로 등록
  registerTarget: (el: HTMLElement | null) => void;
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

  // 담기 — sourceEl 이 있으면 fly 모션 후 도착 시 추가, 없으면 즉시 추가
  const add = useCallback(
    (item: CartItem, sourceEl?: HTMLElement | null) => {
      const target = targetRef.current;
      if (!sourceEl || !target || typeof document === "undefined") {
        pushItem(item);
        return;
      }
      // 도착 순간 장바구니에 추가 → 새 카드는 클론이 안착한 자리에 그대로 뜨고,
      // 기존 카드는 transition-transform 으로 부드럽게 밀려난다(통 튀는 펄스 제거).
      flyToCart(sourceEl, target, item.src, () => pushItem(item));
    },
    [pushItem]
  );

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }, []);
  const clear = useCallback(() => setItems([]), []);
  const has = useCallback((id: string) => items.some((p) => p.id === id), [items]);

  return (
    <CartContext.Provider
      value={{ items, has, add, remove, clear, count: items.length, registerTarget }}
    >
      {children}
    </CartContext.Provider>
  );
}

// 사진 클론을 source 에서 cart target 으로 날려보낸다 (Web Animations API, 라이브러리 없음)
function flyToCart(sourceEl: HTMLElement, target: HTMLElement, src: string, onLand: () => void) {
  const s = sourceEl.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  if (s.width === 0 || t.width === 0) {
    onLand();
    return;
  }
  const clone = document.createElement("img");
  clone.src = src;
  clone.setAttribute("aria-hidden", "true");
  Object.assign(clone.style, {
    position: "fixed",
    left: `${s.left}px`,
    top: `${s.top}px`,
    width: `${s.width}px`,
    height: `${s.height}px`,
    objectFit: "cover",
    borderRadius: "14px",
    boxShadow: "0 10px 30px rgba(0,0,0,.28)",
    zIndex: "200",
    pointerEvents: "none",
    margin: "0",
  } as CSSStyleDeclaration);
  document.body.appendChild(clone);

  const dx = t.left + t.width / 2 - (s.left + s.width / 2);
  const dy = t.top + t.height / 2 - (s.top + s.height / 2);
  // 도착 시 장바구니 카드(약 56px) 크기에 맞춰 축소 → 클론이 그대로 카드로 안착하는 느낌
  const endScale = Math.max(0.16, Math.min(0.5, 56 / s.width));

  const anim = clone.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1, offset: 0 },
      {
        transform: `translate(${dx * 0.55}px, ${dy * 0.55}px) scale(${(1 + endScale) / 2})`,
        opacity: 1,
        offset: 0.55,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(${endScale})`, opacity: 1, offset: 1 },
    ],
    { duration: 620, easing: "cubic-bezier(.45,0,.2,1)" }
  );
  // 끊김 없이: 먼저 장바구니에 담아 카드가 렌더된 뒤 다음 프레임에 클론 제거
  const finish = () => {
    onLand();
    requestAnimationFrame(() => clone.remove());
  };
  anim.onfinish = finish;
  anim.oncancel = finish;
}

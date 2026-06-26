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
      // 장바구니 담기 = 전환 행동 → A11 혜택 hook 더 이상 안 띄움
      try {
        localStorage.setItem("samae:hooked", "1");
      } catch {
        /* 무시 */
      }
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
  // 장바구니 미리보기 카드 너비(64px, FloatingCart CART_W)에 맞춰 축소 →
  // 같은 비율 그대로 카드로 안착. 사진 원래 비율은 균등 스케일이라 유지됨.
  const CART_PEEK_W = 64;
  const endScale = Math.max(0.16, Math.min(0.8, CART_PEEK_W / s.width));
  // 테두리·radius 는 transform scale 로 같이 줄어드므로, 착지(=endScale)에서 정확히
  // 3px/8px 가 되도록 역보정. border 는 box 밖(content-box)이라 미리보기의 ring 과 동일.
  const frameBorder = 3 / endScale;
  const frameRadius = 8 / endScale;

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
    boxSizing: "content-box",
    borderRadius: `${frameRadius}px`,
    border: `${frameBorder}px solid #fff`,
    boxShadow: "0 8px 22px rgba(0,0,0,0.42)",
    transformOrigin: "center",
    zIndex: "200",
    pointerEvents: "none",
    margin: "0",
  } as CSSStyleDeclaration);
  document.body.appendChild(clone);

  const dx = t.left + t.width / 2 - (s.left + s.width / 2);
  const dy = t.top + t.height / 2 - (s.top + s.height / 2);

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

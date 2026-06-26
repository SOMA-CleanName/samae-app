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
      flyToCart(sourceEl, target, item.src, cartCardJitter(item.id).rot, () => pushItem(item));
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

// 사진 클론을 source 에서 cart target 으로 날려보낸다 (Web Animations API, 라이브러리 없음).
// 폴라로이드(흰 프레임 div + 사진 img)로 날아가 미리보기 카드로 그대로 안착.
function flyToCart(
  sourceEl: HTMLElement,
  target: HTMLElement,
  src: string,
  endRot: number,
  onLand: () => void
) {
  const s = sourceEl.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  if (s.width === 0 || t.width === 0) {
    onLand();
    return;
  }
  // 사진 영역이 미리보기 photoW(56px)가 되도록 축소. 원래 비율은 균등 스케일이라 유지.
  const endScale = Math.max(0.14, Math.min(0.9, PEEK_FRAME.photoW / s.width));
  // 프레임 여백·radius 는 scale 로 같이 줄므로, 착지(=endScale)에서 정확히 카드 px가
  // 되도록 역보정(1/endScale). 시작 땐 프레임이 크지만 그게 오히려 폴라로이드처럼 보임.
  const k = 1 / endScale;
  const padTop = PEEK_FRAME.top * k;
  const padSide = PEEK_FRAME.side * k;
  const padBottom = PEEK_FRAME.bottom * k;

  const wrap = document.createElement("div");
  wrap.setAttribute("aria-hidden", "true");
  Object.assign(wrap.style, {
    position: "fixed",
    left: `${s.left - padSide}px`,
    top: `${s.top - padTop}px`,
    background: "#fff",
    borderRadius: `${3 * k}px`,
    padding: `${padTop}px ${padSide}px ${padBottom}px`,
    boxShadow: "0 8px 22px rgba(0,0,0,0.34)",
    boxSizing: "content-box",
    transformOrigin: "center",
    zIndex: "200",
    pointerEvents: "none",
    margin: "0",
  } as CSSStyleDeclaration);
  const img = document.createElement("img");
  img.src = src;
  Object.assign(img.style, {
    display: "block",
    width: `${s.width}px`,
    height: `${s.height}px`,
    objectFit: "cover",
    borderRadius: "1px",
  } as CSSStyleDeclaration);
  wrap.appendChild(img);
  document.body.appendChild(wrap);

  // wrap(프레임 포함) 중심 → target 중심 으로 이동
  const totalW = s.width + padSide * 2;
  const totalH = s.height + padTop + padBottom;
  const startCx = s.left - padSide + totalW / 2;
  const startCy = s.top - padTop + totalH / 2;
  const dx = t.left + t.width / 2 - startCx;
  const dy = t.top + t.height / 2 - startCy;

  const anim = wrap.animate(
    [
      { transform: "translate(0,0) scale(1) rotate(0deg)", opacity: 1, offset: 0 },
      {
        transform: `translate(${dx * 0.55}px, ${dy * 0.55}px) scale(${(1 + endScale) / 2}) rotate(${endRot * 0.5}deg)`,
        opacity: 1,
        offset: 0.55,
      },
      {
        transform: `translate(${dx}px, ${dy}px) scale(${endScale}) rotate(${endRot}deg)`,
        opacity: 1,
        offset: 1,
      },
    ],
    { duration: 640, easing: "cubic-bezier(.45,0,.2,1)" }
  );
  // 끊김 없이: 먼저 장바구니에 담아 카드가 렌더된 뒤 다음 프레임에 클론 제거
  const finish = () => {
    onLand();
    requestAnimationFrame(() => wrap.remove());
  };
  anim.onfinish = finish;
  anim.oncancel = finish;
}

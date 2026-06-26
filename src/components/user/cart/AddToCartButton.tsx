"use client";

import { useCart, type CartItem } from "./CartProvider";

// 사진 카드/상세의 '+' 담기 버튼. 담기면 사진이 하단 장바구니로 빨려들어감.
// 이미 담겼으면 체크 표시 + 다시 누르면 빼기.
export function AddToCartButton({ item, className = "" }: { item: CartItem; className?: string }) {
  const { has, add, remove } = useCart();
  const inCart = has(item.id);

  function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (inCart) {
      remove(item.id);
      return;
    }
    // 카드 안의 이미지를 fly 출발점으로
    const card = e.currentTarget.closest("[data-cart-card]");
    const img = card?.querySelector("img") as HTMLElement | null;
    add(item, img);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={inCart}
      aria-label={inCart ? "장바구니에서 빼기" : "장바구니에 담기"}
      className={[
        "grid h-9 w-9 cursor-pointer place-items-center rounded-full shadow-sm backdrop-blur transition-colors",
        inCart ? "bg-brand text-white" : "bg-white/90 text-fg/80 hover:bg-white",
        className,
      ].join(" ")}
    >
      {inCart ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

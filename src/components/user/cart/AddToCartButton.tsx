"use client";

import { useCart, type CartItem } from "./CartProvider";

// 사진 카드/상세의 '+' 담기 버튼. 담기면 사진이 하단 장바구니로 빨려들어감.
// 이미 담겼으면 체크 표시 + 다시 누르면 빼기.
export function AddToCartButton({
  item,
  className = "",
  variant = "overlay",
}: {
  item: CartItem;
  className?: string;
  variant?: "overlay" | "row";
}) {
  const { has, add, remove } = useCart();
  const inCart = has(item.id);
  const row = variant === "row";

  function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (inCart) {
      remove(item.id);
      return;
    }
    // fly 출발점 = 카드 컨테이너(항상 화면에 보이는 프레임). 버튼이 카드 밖(사진 상세 액션행)이면
    // 페이지 첫 [data-cart-card](=상세 캐러셀 프레임)로 폴백. img 대신 컨테이너를 쓰는 이유:
    // 캐러셀은 가로 스크롤이라 첫 img 가 화면 밖(왼쪽)에 있을 수 있어 엉뚱한 곳에서 날아옴.
    const card = e.currentTarget.closest<HTMLElement>("[data-cart-card]");
    const source = card ?? document.querySelector<HTMLElement>("[data-cart-card]");
    add(item, source);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={inCart}
      aria-label={inCart ? "관심 해제" : "관심 추가"}
      className={[
        "grid cursor-pointer place-items-center rounded-full transition-colors",
        // overlay(탐색 갤러리): 보이는 원·아이콘은 24px 그대로, 투명 ::before 로 탭 영역만 44px 로 확장
        row
          ? "h-9 w-9"
          : "relative h-6 w-6 backdrop-blur-sm before:absolute before:-inset-2.5 before:content-['']",
        inCart
          ? "bg-brand text-white"
          : row
            ? "bg-bg/80 text-fg shadow-sm ring-1 ring-line hover:bg-bg"
            : "bg-black/30 text-white hover:bg-black/55",
        className,
      ].join(" ")}
    >
      {inCart ? (
        <svg viewBox="0 0 24 24" className={row ? "h-[18px] w-[18px]" : "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="2.6">
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className={row ? "h-[18px] w-[18px]" : "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

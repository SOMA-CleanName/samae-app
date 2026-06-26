"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCart } from "./CartProvider";

// 하단 우측 장바구니 — 담은 사진이 겹쳐 모서리만 살짝 보이고,
// 클릭하면 모달로 펼쳐져 담은 사진들을 비교·열람한다.
export function FloatingCart() {
  const { items, count, remove, registerTarget } = useCart();
  const stackRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    registerTarget(stackRef.current);
  }, [registerTarget]);

  // 비었으면 숨김 (담는 순간 fly 도착 지점이 필요하니 등록은 위에서 유지)
  if (count === 0) {
    // 빈 상태에서도 fly 목표가 필요해 보이지 않는 1px 타겟만 둔다(우측 가장자리).
    return (
      <button
        ref={stackRef}
        aria-hidden
        tabIndex={-1}
        className="pointer-events-none fixed bottom-28 right-0 h-1 w-1 opacity-0"
      />
    );
  }

  const peek = items.slice(-3); // 최근 3장 부채꼴

  return (
    <>
      {/* 우측 가장자리에 카드가 부채꼴로 겹쳐 좌측 일부가 삐져나옴 */}
      <button
        ref={stackRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="장바구니 보기"
        className="fixed bottom-28 right-0 z-40 cursor-pointer"
      >
        {/* 카드 묶음을 오른쪽으로 밀어 좌측 부채꼴만 보이게 */}
        <div className="relative h-24 w-16 translate-x-[34%]">
          {peek.map((it, i) => {
            const rot = (peek.length - 1 - i) * -10;
            return (
              <img
                key={it.id}
                src={it.src}
                alt=""
                // 흰 프레임(카드처럼 보이게, 뒤 갤러리와 분리) + 강한 그림자로 띄움.
                // transition-transform: 새 카드 담기면 기존 카드가 부드럽게 밀려남.
                className="absolute bottom-0 right-0 h-24 w-16 rounded-lg object-cover shadow-[0_8px_22px_rgba(0,0,0,0.42)] ring-[3px] ring-white transition-transform duration-300 ease-out"
                style={{ transformOrigin: "bottom right", transform: `rotate(${rot}deg)`, zIndex: i }}
              />
            );
          })}
        </div>
      </button>

      {open && <CartModal onClose={() => setOpen(false)} items={items} onRemove={remove} />}
    </>
  );
}

function CartModal({
  items,
  onRemove,
  onClose,
}: {
  items: { id: string; src: string }[];
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  // 진입 애니메이션
  const [show, setShow] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(r);
  }, []);

  return (
    <div className="fixed inset-0 z-50 font-kr" role="dialog" aria-modal="true">
      <button
        aria-label="닫기"
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${show ? "opacity-100" : "opacity-0"}`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 max-h-[80svh] rounded-t-3xl bg-bg shadow-pop transition-transform duration-300 ease-out ${
          show ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto flex max-w-xl flex-col">
          <div className="flex items-center justify-between px-5 pb-3 pt-4">
            <p className="text-base font-semibold">
              담은 사진 <span className="text-brand">{items.length}</span>
            </p>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-full px-3 py-1 text-sm font-medium text-muted transition-colors hover:bg-fg/[0.06] hover:text-fg"
            >
              닫기
            </button>
          </div>

          {items.length === 0 ? (
            <p className="px-5 py-16 text-center text-sm text-muted">담은 사진이 없어요.</p>
          ) : (
            <div className="grid max-h-[60svh] grid-cols-3 gap-2 overflow-y-auto px-5 pb-8 sm:grid-cols-4">
              {items.map((it) => (
                <div key={it.id} className="group relative aspect-square overflow-hidden rounded-xl bg-fg/[0.05]">
                  <Link href={`/photos/${it.id}`} onClick={onClose} className="block h-full w-full">
                    <img src={it.src} alt="" className="h-full w-full object-cover" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => onRemove(it.id)}
                    aria-label="빼기"
                    className="absolute right-1 top-1 grid h-6 w-6 cursor-pointer place-items-center rounded-full bg-black/55 text-sm text-white transition-colors hover:bg-black/75"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

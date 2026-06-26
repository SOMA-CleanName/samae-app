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
    // 빈 상태에서도 fly 목표가 필요해 보이지 않는 1px 타겟만 둔다.
    return (
      <button
        ref={stackRef}
        aria-hidden
        tabIndex={-1}
        className="pointer-events-none fixed bottom-24 right-5 h-1 w-1 opacity-0 md:bottom-6 md:right-6"
      />
    );
  }

  const peek = items.slice(-3); // 최근 3장만 겹쳐 노출

  return (
    <>
      <button
        ref={stackRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`장바구니 ${count}장 보기`}
        className="fixed bottom-24 right-5 z-40 h-16 w-16 cursor-pointer md:bottom-6 md:right-6"
      >
        {/* 겹친 카드 스택 */}
        {peek.map((it, i) => (
          <img
            key={it.id}
            src={it.src}
            alt=""
            className="absolute h-14 w-14 rounded-xl object-cover shadow-lg ring-1 ring-black/10 transition-transform"
            style={{
              right: `${i * 5}px`,
              bottom: `${i * 5}px`,
              transform: `rotate(${(peek.length - 1 - i) * -5}deg)`,
              zIndex: i,
            }}
          />
        ))}
        {/* 카운트 배지 */}
        <span className="absolute -right-1 -top-1 z-10 grid h-6 min-w-6 place-items-center rounded-full bg-brand px-1.5 text-xs font-bold text-white shadow ring-2 ring-bg">
          {count}
        </span>
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

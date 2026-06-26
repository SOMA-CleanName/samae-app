"use client";

/* eslint-disable @next/next/no-img-element */
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCart } from "./CartProvider";
import { submitCartInquiry } from "@/app/(user)/inquiry/actions";

// 장바구니 — 담은 사진이 부채꼴로 겹쳐 가장자리에 삐져나옴. 탭하면 모달.
// 드래그로 손가락 따라 자유 이동 → 놓으면 가까운 좌/우 가장자리로 부드럽게 스냅(위치 저장).
const POS_KEY = "samae:cart-pos";
const CART_W = 64; // w-16

export function FloatingCart() {
  const { items, count, remove, registerTarget } = useCart();
  const stackRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // right/top(px) 로 위치 — right 값을 트랜지션해서 좌↔우 슬라이드가 애니메이션됨
  const [view, setView] = useState<{ right: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ active: false, moved: false, startX: 0, startY: 0, offX: 0, offY: 0 });

  useEffect(() => {
    registerTarget(stackRef.current);
  }, [registerTarget, count]);

  const clampTop = (t: number) => Math.min(Math.max(80, t), window.innerHeight - 150);
  const clampRight = (r: number) => Math.min(Math.max(0, r), window.innerWidth - CART_W);
  const leftEdgeRight = () => window.innerWidth - CART_W;

  // 저장된 위치 로드 (없으면 우측, 화면 하단쯤)
  useEffect(() => {
    let side: "left" | "right" = "right";
    let top = window.innerHeight - 220;
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        side = p.side === "left" ? "left" : "right";
        top = p.top ?? top;
      }
    } catch {
      /* 무시 */
    }
    setView({ right: side === "right" ? 0 : leftEdgeRight(), top: clampTop(top) });
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    if (!view) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const rect = stackRef.current?.getBoundingClientRect();
    drag.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      offX: e.clientX - (rect?.left ?? 0),
      offY: e.clientY - (rect?.top ?? 0),
    };
    setDragging(true);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.active) return;
    if (!drag.current.moved && (Math.abs(e.clientX - drag.current.startX) > 6 || Math.abs(e.clientY - drag.current.startY) > 6)) {
      drag.current.moved = true;
    }
    if (drag.current.moved) {
      const right = clampRight(window.innerWidth - (e.clientX - drag.current.offX) - CART_W);
      setView({ right, top: clampTop(e.clientY - drag.current.offY) });
    }
  }
  function onPointerUp() {
    if (!drag.current.active) return;
    drag.current.active = false;
    setDragging(false);
    if (drag.current.moved && view) {
      // 컨테이너 중심이 화면 좌측 절반이면 왼쪽 가장자리로
      const center = window.innerWidth - view.right - CART_W / 2;
      const side: "left" | "right" = center < window.innerWidth / 2 ? "left" : "right";
      const snapRight = side === "right" ? 0 : leftEdgeRight();
      setView({ right: snapRight, top: view.top });
      try {
        localStorage.setItem(POS_KEY, JSON.stringify({ side, top: view.top }));
      } catch {
        /* 무시 */
      }
    }
    // 열기는 onClick 에서 처리(데스크톱 마우스 호환 — pointercapture 후에도 click 은 발화)
  }
  // 드래그가 아니면 클릭으로 열기 (드래그 직후 합성 click 은 moved 가드로 무시)
  function onClick() {
    if (drag.current.moved) {
      drag.current.moved = false;
      return;
    }
    setOpen(true);
  }

  // 부채꼴 방향 — 컨테이너가 화면 우측이면 right, 좌측이면 left (드래그 중에도 라이브로 미러)
  const side: "left" | "right" =
    view && view.right > (typeof window !== "undefined" ? window.innerWidth : 9999) / 2 ? "left" : "right";
  const style: React.CSSProperties = view
    ? {
        right: view.right,
        top: view.top,
        transition: dragging ? "none" : "right 0.3s cubic-bezier(.4,0,.2,1), top 0.3s cubic-bezier(.4,0,.2,1)",
      }
    : { bottom: 112, right: 0 };

  // 비었어도 fly 도착 지점 유지(보이지 않는 1px)
  if (count === 0) {
    return (
      <button ref={stackRef} aria-hidden tabIndex={-1} style={style} className="pointer-events-none fixed z-40 h-1 w-1 opacity-0" />
    );
  }

  const peek = items.slice(-3);

  return (
    <>
      <button
        ref={stackRef}
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={onClick}
        aria-label="장바구니 보기 (드래그로 이동)"
        style={style}
        className="fixed z-40 cursor-grab touch-none select-none active:cursor-grabbing"
      >
        {/* 카드 묶음을 가장자리 밖으로 밀어 부채꼴 일부만 보이게 (방향에 따라 미러) */}
        <div
          className="relative h-24 w-16"
          style={{ transform: `translateX(${side === "right" ? "34%" : "-34%"})` }}
        >
          {peek.map((it, i) => {
            const rot = (peek.length - 1 - i) * (side === "right" ? -10 : 10);
            return (
              <img
                key={it.id}
                src={it.src}
                alt=""
                draggable={false}
                className={`absolute bottom-0 ${side === "right" ? "right-0" : "left-0"} h-24 w-16 rounded-lg object-cover shadow-[0_8px_22px_rgba(0,0,0,0.42)] ring-[3px] ring-white transition-transform duration-300 ease-out`}
                style={{
                  transformOrigin: side === "right" ? "bottom right" : "bottom left",
                  transform: `rotate(${rot}deg)`,
                  zIndex: i,
                }}
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
  const { clear } = useCart();
  const [show, setShow] = useState(false);
  const [askContact, setAskContact] = useState(false);
  const [contact, setContact] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [state, formAction, pending] = useActionState(submitCartInquiry, { ok: false });

  useEffect(() => {
    const r = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(r);
  }, []);

  // 성공 → Lead 픽셀(중복 제거 eventID)
  const fired = useRef(false);
  useEffect(() => {
    if (!state.ok || fired.current) return;
    fired.current = true;
    if (state.leadId) window.fbq?.("track", "Lead", {}, { eventID: `inquiry_${state.leadId}` });
  }, [state.ok, state.leadId]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contact.trim() || !agreed) return;
    const fd = new FormData();
    fd.set("contact", contact);
    fd.set("photoIds", items.map((i) => i.id).join(","));
    startTransition(() => formAction(fd));
  }

  return (
    <div className="fixed inset-0 z-50 font-kr" role="dialog" aria-modal="true">
      <button
        aria-label="닫기"
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${show ? "opacity-100" : "opacity-0"}`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 max-h-[85svh] rounded-t-3xl bg-bg shadow-pop transition-transform duration-300 ease-out ${
          show ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto flex max-w-xl flex-col">
          {state.ok ? (
            // 완료
            <div className="px-5 py-14 text-center">
              <p className="text-lg font-bold">신청 완료!</p>
              <p className="mt-1.5 text-sm text-muted">담아둔 사진들로 작가님이 곧 연락드릴 거예요.</p>
              <button
                type="button"
                onClick={() => {
                  clear();
                  onClose();
                }}
                className="mt-6 cursor-pointer rounded-full bg-fg px-6 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
              >
                닫기
              </button>
            </div>
          ) : (
            <>
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
                <>
                  <div className="grid max-h-[44svh] grid-cols-3 gap-2 overflow-y-auto px-5 pb-4 sm:grid-cols-4">
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

                  {/* 일괄 상담 신청 */}
                  <div className="border-t border-line px-5 pb-8 pt-4">
                    {!askContact ? (
                      <button
                        type="button"
                        onClick={() => setAskContact(true)}
                        className="w-full cursor-pointer rounded-2xl bg-brand py-4 text-base font-bold text-white transition-opacity hover:opacity-90"
                      >
                        이 사진들로 무료 상담 신청
                      </button>
                    ) : (
                      <form onSubmit={onSubmit}>
                        <input
                          type="text"
                          value={contact}
                          onChange={(e) => setContact(e.target.value)}
                          placeholder="전화번호 · 카카오 ID · 인스타 등"
                          autoFocus
                          className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-base outline-none transition-colors placeholder:text-fg/30 focus:border-brand"
                        />
                        <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-xs text-muted">
                          <input
                            type="checkbox"
                            checked={agreed}
                            onChange={(e) => setAgreed(e.target.checked)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                          />
                          <span>
                            연락처 전달 및 상담을 위한{" "}
                            <Link href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-fg">
                              개인정보 수집·이용
                            </Link>
                            에 동의합니다.
                          </span>
                        </label>
                        {state.error && <p className="mt-2 text-xs font-medium text-brand">{state.error}</p>}
                        <button
                          type="submit"
                          disabled={!contact.trim() || !agreed || pending}
                          className="mt-3 h-12 w-full cursor-pointer rounded-xl bg-brand text-base font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {pending ? "신청 중…" : "상담 신청하기"}
                        </button>
                      </form>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

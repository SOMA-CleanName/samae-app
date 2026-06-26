"use client";

/* eslint-disable @next/next/no-img-element */
import {
  startTransition,
  useActionState,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useCart, cartCardJitter, PEEK_CARD_W, type CartItem } from "./CartProvider";
import { submitCartInquiry } from "@/app/(user)/inquiry/actions";

// FLIP 은 페인트 전에 측정/적용해야 깜빡임이 없음(SSR 에선 useEffect 로 폴백)
const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

// 장바구니 — 담은 사진이 가장자리에 폴라로이드 더미(도크)로 떠 있음. 드래그로 이동, 클릭하면
// "그 사진들 자체"가 도크에서 빠져나와 화면 가득 펼쳐짐(복제본 없음). 닫으면 다시 도크로 모임.
const POS_KEY = "samae:cart-pos";
const CART_W = PEEK_CARD_W; // 64

// 펼침용 흩뿌림 변형 — id 해시로 각도·셀 내 오프셋 결정(고정)
function spreadJitter(id: string): { rot: number; fx: number; fy: number } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return {
    rot: (h % 11) - 5, // -5 ~ 5도(살짝만 기울임 → 그리드 유지)
    fx: (((h >> 5) % 21) - 10) / 10, // -1 ~ 1
    fy: (((h >> 11) % 21) - 10) / 10, // -1 ~ 1
  };
}

type Placed = {
  it: CartItem;
  x: number;
  y: number;
  rot: number;
  photoW: number;
  photoH: number;
  side: number;
  bottom: number;
  z: number;
};

export function FloatingCart() {
  const { items, count, remove, consumeFlyFrom } = useCart();
  // 단계: dock(가장자리) → center(중앙 스택) → spread(펼침). 열고 닫을 때 중앙을 경유.
  const [phase, setPhase] = useState<"dock" | "center" | "spread">("dock");
  const open = phase !== "dock";
  const [view, setView] = useState<{ right: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ active: false, moved: false, startX: 0, startY: 0, baseRight: 0, baseTop: 0 });
  const [vp, setVp] = useState<{ w: number; h: number } | null>(null);
  const [focused, setFocused] = useState<{ id: string; rect: DOMRect } | null>(null);
  const [formFor, setFormFor] = useState<string | null>(null); // null/"all"/photoId
  const [contact, setContact] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [state, formAction, pending] = useActionState(submitCartInquiry, { ok: false });
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const N = count;

  // 뷰포트
  useIsoLayout(() => {
    if (typeof window === "undefined") return;
    const set = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    set();
    window.addEventListener("resize", set);
    return () => window.removeEventListener("resize", set);
  }, []);

  // 도크 위치 로드
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
    setView({
      right: side === "right" ? 0 : window.innerWidth - CART_W,
      top: Math.min(Math.max(80, top), window.innerHeight - 150),
    });
  }, []);

  // 비워지면 닫기
  useEffect(() => {
    if (phase !== "dock" && N === 0) {
      setFocused(null);
      setFormFor(null);
      setPhase("dock");
    }
  }, [phase, N]);

  // 성공 → Lead 픽셀(중복 제거 eventID)
  const fired = useRef(false);
  useEffect(() => {
    if (!state.ok || fired.current) return;
    fired.current = true;
    if (state.leadId) window.fbq?.("track", "Lead", {}, { eventID: `inquiry_${state.leadId}` });
  }, [state.ok, state.leadId]);

  const clampTop = (t: number) => Math.min(Math.max(80, t), window.innerHeight - 150);
  const clampRight = (r: number) => Math.min(Math.max(0, r), window.innerWidth - CART_W);

  // ── 도크 드래그(닫힌 상태에서만) ──
  function startDrag(e: React.PointerEvent) {
    if (open || !view) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      baseRight: view.right,
      baseTop: view.top,
    };
    setDragging(true);
  }
  function moveDrag(e: React.PointerEvent) {
    if (open || !drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (!drag.current.moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) drag.current.moved = true;
    if (drag.current.moved) {
      setView({ right: clampRight(drag.current.baseRight - dx), top: clampTop(drag.current.baseTop + dy) });
    }
  }
  function endDrag() {
    if (open || !drag.current.active) return;
    drag.current.active = false;
    setDragging(false);
    if (drag.current.moved && view) {
      const center = window.innerWidth - view.right - CART_W / 2;
      const side: "left" | "right" = center < window.innerWidth / 2 ? "left" : "right";
      setView({ right: side === "right" ? 0 : window.innerWidth - CART_W, top: view.top });
      try {
        localStorage.setItem(POS_KEY, JSON.stringify({ side, top: view.top }));
      } catch {
        /* 무시 */
      }
    }
  }

  // 펼침: 도크 → 중앙 스택 → 펼침
  function startOpen() {
    setPhase("center");
    window.setTimeout(() => setPhase("spread"), 300);
  }
  // 닫힘: 펼침 → 중앙 스택 → 도크 복귀
  function close() {
    setFocused(null);
    setFormFor(null);
    setPhase("center");
    window.setTimeout(() => setPhase("dock"), 300);
  }
  function removeOne(id: string) {
    setLeaving((s) => new Set(s).add(id));
    setTimeout(() => {
      remove(id);
      setLeaving((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }, 260);
  }
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contact.trim() || !agreed) return;
    const ids = formFor === "all" || formFor === null ? items.map((i) => i.id) : [formFor];
    const fd = new FormData();
    fd.set("contact", contact);
    fd.set("photoIds", ids.join(","));
    startTransition(() => formAction(fd));
  }

  // ── 펼침 레이아웃(그리드) ──
  const SCROLL = N >= 9;
  const { cards, contentH, cardW } = ((): { cards: Placed[]; contentH: number; cardW: number } => {
    if (!vp || N === 0) return { cards: [], contentH: 0, cardW: CART_W };
    const { w: W, h: H } = vp;
    const padX = Math.max(16, W * 0.06);
    const topPad = 84;
    const bottomReserve = 150;
    const areaW = W - padX * 2;
    const CARD_ASPECT = 0.8;

    let cols: number;
    let cardW: number;
    let cellH: number;
    if (SCROLL) {
      cols = Math.max(2, Math.min(4, Math.floor(areaW / 150)));
      cardW = Math.min((areaW / cols) * 0.92, 240);
      cellH = cardW / CARD_ASPECT + 18;
    } else {
      const areaH = Math.max(180, H - topPad - bottomReserve);
      cols = 1;
      cardW = 0;
      for (let c = 1; c <= N; c++) {
        const rows = Math.ceil(N / c);
        const w = Math.min((areaW / c) * 0.92, (areaH / rows) * 0.92 * CARD_ASPECT);
        if (w > cardW) {
          cardW = w;
          cols = c;
        }
      }
      cardW = Math.min(cardW, 240);
      cellH = areaH / Math.ceil(N / cols);
    }
    const rows = Math.ceil(N / cols);
    const cellW = areaW / cols;
    const side = Math.max(6, Math.round(cardW * 0.055));
    const bottom = Math.max(14, Math.round(cardW * 0.16));
    const photoW = Math.round(cardW - side * 2);
    const maxPhotoH = Math.round(cellH * 0.9 - side - bottom);
    const contentH = SCROLL ? topPad + rows * cellH + 32 : H;

    const cards = items.map((it, i) => {
      const row = Math.floor(i / cols);
      const inRow = i - row * cols;
      const itemsInRow = row < rows - 1 ? cols : N - cols * (rows - 1);
      const rowStartX = padX + (areaW - itemsInRow * cellW) / 2;
      const cxc = rowStartX + (inRow + 0.5) * cellW;
      const cyc = topPad + (row + 0.5) * cellH;
      const j = spreadJitter(it.id);
      const x = cxc + j.fx * Math.min(8, cellW * 0.03);
      const y = cyc + j.fy * Math.min(6, cellH * 0.03);
      const ratio = it.w > 0 && it.h > 0 ? it.h / it.w : 1;
      const photoH = Math.min(Math.round(photoW * ratio), Math.max(40, maxPhotoH));
      return { it, x, y, rot: j.rot, photoW, photoH, side, bottom, z: i };
    });
    return { cards, contentH, cardW };
  })();

  // ── 도크(닫힘) 위치·스케일 ──
  const W = vp?.w ?? 0;
  const H = vp?.h ?? 0;
  const dockRight = view?.right ?? 0;
  const dockTop = view?.top ?? H - 220;
  const dockOnRight = view ? W - view.right - CART_W / 2 >= W / 2 : true;
  const dockCx = W - dockRight - CART_W / 2 + (dockOnRight ? 0.34 : -0.34) * CART_W;
  const dockCy = dockTop + 46;
  const dockScale = cardW > 0 ? CART_W / cardW : 0.27;
  const cx = W / 2; // 중앙 스택 위치
  const cy = H / 2;

  // ── 방금 담은 카드 FLIP(출발 사진 → 도크) ──
  const newestId = N > 0 ? items[items.length - 1].id : null;
  useIsoLayout(() => {
    if (!newestId || phase !== "dock") return;
    const from = consumeFlyFrom(newestId);
    if (!from) return;
    const el = cardRefs.current.get(newestId);
    if (!el) return;
    const last = el.getBoundingClientRect();
    if (last.width === 0) return;
    // 현재 인라인(도크 포즈)으로 자연 복귀하도록, 시작 키프레임에만 출발 위치 추가
    const restTf = el.style.transform;
    const dx = from.left + from.width / 2 - (last.left + last.width / 2);
    const dy = from.top + from.height / 2 - (last.top + last.height / 2);
    const scale = Math.max(0.05, from.width / last.width);
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${scale}) ${restTf}`, offset: 0 },
        { transform: restTf, offset: 1 },
      ],
      { duration: 540, easing: "cubic-bezier(.42,0,.18,1)" }
    );
  }, [newestId, count, open, consumeFlyFrom]);

  if (!vp || N === 0) return null;

  return (
    <>
      {/* 배경(테이블) — 펼침 시에만 보이고, 빈 곳 탭하면 닫힘 */}
      <div
        aria-hidden={!open}
        onClick={open ? close : undefined}
        className={`fixed inset-0 z-[50] bg-black/85 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* 카드 레이어 — 도크↔중앙↔펼침 동일 엘리먼트가 변형(복제본 없음) */}
      <div
        onClick={phase === "spread" ? close : undefined}
        className={`fixed inset-0 z-[55] ${
          phase === "spread" && SCROLL ? "overflow-y-auto overscroll-contain" : ""
        } ${open ? "" : "pointer-events-none"}`}
      >
        <div className="relative w-full" style={{ height: phase === "spread" && SCROLL ? contentH : "100%" }}>
          {cards.map(({ it, x, y, rot, photoW, photoH, side, bottom, z }) => {
            const isLeaving = leaving.has(it.id);
            const depth = N - 1 - z; // 0 = 최신(맨 위)
            const j = cartCardJitter(it.id);
            let tf: string;
            let op: number;
            if (isLeaving) {
              tf = `translate(0,-44px) scale(.6) rotate(${rot}deg)`;
              op = 0;
            } else if (phase === "spread") {
              tf = `translate(0,0) scale(1) rotate(${rot}deg)`;
              op = 1;
            } else if (phase === "center") {
              // 중앙에 모인 스택(도크와 같은 크기·지터)
              tf = `translate(${cx - x + j.dx}px, ${cy - y + j.dy}px) scale(${dockScale}) rotate(${j.rot}deg)`;
              op = depth >= 5 ? 0 : 1;
            } else {
              // 도크 — 그 자리의 폴라로이드 더미
              tf = `translate(${dockCx - x + j.dx}px, ${dockCy - y + j.dy}px) scale(${dockScale}) rotate(${j.rot}deg)`;
              op = depth >= 5 ? 0 : 1;
            }
            // 펼칠 때만 스태거 — 그리드 위(z 작은 쪽)부터 한 장씩 펼쳐짐. 모임·이동은 한 덩어리로.
            const delay = !dragging && phase === "spread" ? Math.min(z, 16) * 22 : 0;
            return (
              <div
                key={it.id}
                className="absolute"
                style={{ left: x, top: y, transform: "translate(-50%,-50%)", zIndex: 10 + z }}
              >
                <button
                  ref={(el) => {
                    if (el) cardRefs.current.set(it.id, el);
                    else cardRefs.current.delete(it.id);
                  }}
                  type="button"
                  onPointerDown={startDrag}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (phase === "spread") {
                      setFocused({ id: it.id, rect: e.currentTarget.getBoundingClientRect() });
                    } else if (phase === "dock") {
                      if (drag.current.moved) drag.current.moved = false;
                      else startOpen();
                    }
                    // center: 전환 중 — 무시
                  }}
                  aria-label={open ? "크게 보기" : "장바구니 펼치기 (드래그로 이동)"}
                  className="block cursor-pointer select-none bg-white shadow-[0_10px_28px_rgba(0,0,0,0.4)]"
                  style={{
                    padding: `${side}px ${side}px ${bottom}px`,
                    borderRadius: 3,
                    transformOrigin: "center",
                    transform: tf,
                    opacity: op,
                    pointerEvents: "auto", // 닫힘 시 레이어가 none 이라 카드만 살림
                    touchAction: open ? "auto" : "none",
                    transition: dragging
                      ? "none"
                      : `transform 460ms cubic-bezier(.2,.7,.2,1) ${delay}ms, opacity 360ms ease ${delay}ms`,
                  }}
                >
                  <img
                    src={it.src}
                    alt=""
                    draggable={false}
                    style={{
                      display: "block",
                      width: photoW,
                      height: photoH,
                      objectFit: "cover",
                      borderRadius: 1,
                    }}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 펼침 UI — 상단/하단/포커스/성공 (완전히 펼쳐진 뒤에만) */}
      {phase === "spread" && (
        <>
          {state.ok ? (
            <div className="fixed inset-0 z-[68] grid place-items-center px-6 text-center">
              <div>
                <p className="text-xl font-bold text-white">신청 완료!</p>
                <p className="mt-2 text-sm text-white/70">담아둔 사진들로 작가님이 곧 연락드릴 거예요.</p>
              </div>
            </div>
          ) : (
            <>
              {/* 상단 — 안내 + 닫기 */}
              <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex items-center justify-between px-5 pt-5">
                <p className="text-sm text-white/75">
                  담은 사진 <span className="font-bold text-white">{N}</span>
                  <span className="text-white/45"> · 탭하면 크게</span>
                </p>
                <button
                  type="button"
                  onClick={close}
                  aria-label="닫기"
                  className="pointer-events-auto grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* 하단 — 일괄 상담 CTA */}
              <div className="fixed inset-x-0 bottom-0 z-[60] px-4 pb-6 pt-3">
                <div className="mx-auto max-w-md">
                  {formFor === null ? (
                    <button
                      type="button"
                      onClick={() => setFormFor("all")}
                      className="w-full cursor-pointer rounded-2xl bg-brand py-4 text-base font-bold text-white shadow-pop transition-opacity hover:opacity-90"
                    >
                      이 사진들로 무료 상담 신청 ({N})
                    </button>
                  ) : (
                    <form onSubmit={onSubmit} className="rounded-2xl bg-bg p-4 shadow-pop">
                      <p className="mb-2.5 text-sm font-semibold text-fg">
                        {formFor === "all" ? `담은 사진 ${N}장으로 상담 신청` : "이 사진으로 상담 신청"}
                        <button
                          type="button"
                          onClick={() => setFormFor(null)}
                          className="float-right cursor-pointer text-xs font-medium text-muted hover:text-fg"
                        >
                          취소
                        </button>
                      </p>
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
              </div>

              {/* 탭한 사진 중앙 확대 */}
              {focused && items.some((i) => i.id === focused.id) && (
                <FocusedPhoto
                  item={items.find((i) => i.id === focused.id)!}
                  fromRect={focused.rect}
                  vp={vp}
                  onBack={() => setFocused(null)}
                  onRemove={(id) => {
                    setFocused(null);
                    removeOne(id);
                  }}
                  onInquire={(id) => {
                    setFocused(null);
                    setFormFor(id);
                  }}
                />
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

// 탭한 사진을 중앙으로 확대(FLIP) + [무료 상담]/[상세보기]. 빼기는 X.
function FocusedPhoto({
  item,
  fromRect,
  vp,
  onBack,
  onRemove,
  onInquire,
}: {
  item: CartItem;
  fromRect: DOMRect;
  vp: { w: number; h: number } | null;
  onBack: () => void;
  onRemove: (id: string) => void;
  onInquire: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useIsoLayout(() => {
    const el = ref.current;
    if (!el) return;
    const last = el.getBoundingClientRect();
    if (last.width === 0) return;
    const dx = fromRect.left + fromRect.width / 2 - (last.left + last.width / 2);
    const dy = fromRect.top + fromRect.height / 2 - (last.top + last.height / 2);
    const s = Math.max(0.05, fromRect.width / last.width);
    el.animate(
      [
        { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: 0.7, offset: 0 },
        { transform: "translate(0,0) scale(1)", opacity: 1, offset: 1 },
      ],
      { duration: 320, easing: "cubic-bezier(.2,.7,.2,1)" }
    );
  }, []);

  const vw = vp?.w ?? 360;
  const vh = vp?.h ?? 720;
  const photoW = Math.min(vw * 0.82, 340);
  const ratio = item.w > 0 && item.h > 0 ? item.h / item.w : 1;
  const side = Math.max(8, Math.round(photoW * 0.05));
  const bottom = Math.max(20, Math.round(photoW * 0.14));
  const photoH = Math.min(Math.round(photoW * ratio), Math.round(vh * 0.56));

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center px-6 font-kr">
      <button aria-label="뒤로" onClick={onBack} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        aria-label="장바구니에서 빼기"
        className="absolute right-4 top-4 z-10 grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>

      <div
        ref={ref}
        className="relative bg-white shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
        style={{ padding: `${side}px ${side}px ${bottom}px`, borderRadius: 4 }}
      >
        <img
          src={item.src}
          alt=""
          draggable={false}
          style={{ display: "block", width: photoW, height: photoH, objectFit: "cover", borderRadius: 2 }}
        />
      </div>

      <div className="relative z-10 mt-6 flex w-full max-w-xs flex-col gap-2.5">
        <button
          type="button"
          onClick={() => onInquire(item.id)}
          className="cursor-pointer rounded-2xl bg-brand py-3.5 text-base font-bold text-white transition-opacity hover:opacity-90"
        >
          이 사진으로 무료 상담 신청
        </button>
        <Link
          href={`/photos/${item.id}`}
          className="rounded-2xl bg-white/15 py-3.5 text-center text-base font-semibold text-white backdrop-blur transition-colors hover:bg-white/25"
        >
          사진 상세보기
        </Link>
      </div>
    </div>
  );
}

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
import { useCart, cartCardJitter, PEEK_FRAME, PEEK_CARD_W, type CartItem } from "./CartProvider";

// FLIP 은 페인트 전에 측정/적용해야 깜빡임이 없음(SSR 에선 useEffect 로 폴백)
const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;
import { submitCartInquiry } from "@/app/(user)/inquiry/actions";

// 장바구니 — 담은 사진이 부채꼴로 겹쳐 가장자리에 삐져나옴. 탭하면 모달.
// 드래그로 손가락 따라 자유 이동 → 놓으면 가까운 좌/우 가장자리로 부드럽게 스냅(위치 저장).
const POS_KEY = "samae:cart-pos";
const CART_W = 64; // w-16

export function FloatingCart() {
  const { items, count, remove, registerTarget, consumeFlyFrom } = useCart();
  const stackRef = useRef<HTMLButtonElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [open, setOpen] = useState(false);
  // right/top(px) 로 위치 — right 값을 트랜지션해서 좌↔우 슬라이드가 애니메이션됨
  const [view, setView] = useState<{ right: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ active: false, moved: false, startX: 0, startY: 0, offX: 0, offY: 0 });

  useEffect(() => {
    registerTarget(stackRef.current);
  }, [registerTarget, count]);

  // 방금 담은 카드를 출발 사진 자리에서 제자리로 FLIP — 끊김 없는 안착(클론·핸드오프 없음)
  const newestId = count > 0 ? items[items.length - 1].id : null;
  useIsoLayout(() => {
    if (!newestId) return;
    const from = consumeFlyFrom(newestId);
    if (!from) return;
    const el = cardRefs.current.get(newestId);
    if (!el) return;
    const last = el.getBoundingClientRect();
    if (last.width === 0) return;
    const j = cartCardJitter(newestId);
    const rest = `translate(${j.dx}px, ${j.dy}px) rotate(${j.rot}deg)`;
    const dx = from.left + from.width / 2 - (last.left + last.width / 2);
    const dy = from.top + from.height / 2 - (last.top + last.height / 2);
    const scale = Math.max(0.05, from.width / last.width);
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${scale}) ${rest}`, opacity: 1, offset: 0 },
        { transform: rest, opacity: 1, offset: 1 },
      ],
      { duration: 560, easing: "cubic-bezier(.42,0,.18,1)" }
    );
  }, [newestId, count, consumeFlyFrom]);

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

  // 6장 렌더(앞 5장 노출 + 가장 깊은 1장은 페이드아웃 중) → 넘칠 때 툭 사라지지 않게
  const peek = items.slice(-6);

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
        {/* 폴라로이드 더미 — 흰 프레임(하단 두껍게) + 각 사진 실제 비율. 부채꼴 대신 타이트한 더미 */}
        {(() => {
          const photoH = (it: { w: number; h: number }) =>
            it.w > 0 && it.h > 0 ? Math.round((PEEK_FRAME.photoW * it.h) / it.w) : PEEK_FRAME.photoW;
          const cardH = (it: { w: number; h: number }) =>
            photoH(it) + PEEK_FRAME.top + PEEK_FRAME.bottom;
          const maxH = Math.max(...peek.map(cardH));
          return (
            <div
              className="relative"
              style={{
                width: PEEK_CARD_W,
                height: maxH,
                transform: `translateX(${side === "right" ? "34%" : "-34%"})`,
              }}
            >
              {peek.map((it, i) => {
                // 흐트러진 더미 — id 해시로 각도·위치 결정(고정). 최신 카드일수록 위로(zIndex).
                const j = cartCardJitter(it.id);
                // 위에서부터 깊이 — 6번째(가장 깊은)는 opacity 0 으로 서서히 빠짐
                const depth = peek.length - 1 - i;
                return (
                  <div
                    key={it.id}
                    ref={(el) => {
                      if (el) cardRefs.current.set(it.id, el);
                      else cardRefs.current.delete(it.id);
                    }}
                    className="absolute bottom-0 left-1/2 bg-white shadow-[0_8px_20px_rgba(0,0,0,0.3)] transition-[transform,opacity] duration-300 ease-out"
                    style={{
                      padding: `${PEEK_FRAME.top}px ${PEEK_FRAME.side}px ${PEEK_FRAME.bottom}px`,
                      borderRadius: 3,
                      marginLeft: -PEEK_CARD_W / 2,
                      transformOrigin: "center",
                      transform: `translate(${j.dx}px, ${j.dy}px) rotate(${j.rot}deg)`,
                      opacity: depth >= 5 ? 0 : 1,
                      zIndex: i,
                    }}
                  >
                    <img
                      src={it.src}
                      alt=""
                      draggable={false}
                      style={{
                        display: "block",
                        width: PEEK_FRAME.photoW,
                        height: photoH(it),
                        objectFit: "cover",
                        borderRadius: 1,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          );
        })()}
      </button>

      {open && (
        <CartModal
          onClose={() => setOpen(false)}
          items={items}
          onRemove={remove}
          originRef={stackRef}
        />
      )}
    </>
  );
}

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

// 장바구니 펼침 — 담아둔 폴라로이드들이 화면 가득 흩뿌려짐(테이블에 쏟은 느낌).
// 사진 탭=빼기(휙 날아감), 빈 곳/닫기=다시 더미로. 하단 고정 CTA로 일괄 상담.
function CartModal({
  items,
  onRemove,
  onClose,
  originRef,
}: {
  items: CartItem[];
  onRemove: (id: string) => void;
  onClose: () => void;
  // 펼침/닫힘 시 사진이 출발/복귀할 더미(플로팅 버튼) 위치
  originRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { clear } = useCart();
  // 모션 단계: in(더미 자리) → center(가운데로 모임) → open(펼침) → [닫기] center → out(더미로 복귀)
  const [phase, setPhase] = useState<"in" | "center" | "open" | "out">("in");
  const show = phase === "center" || phase === "open"; // 배경·바 노출 상태
  const [vp, setVp] = useState<{ w: number; h: number } | null>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [askContact, setAskContact] = useState(false);
  const [contact, setContact] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [state, formAction, pending] = useActionState(submitCartInquiry, { ok: false });

  useIsoLayout(() => {
    const set = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    set();
    const el = originRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }
    window.addEventListener("resize", set);
    return () => window.removeEventListener("resize", set);
  }, [originRef]);

  // 펼침 시퀀스: in → (다음 프레임) center 로 모임 → 320ms 후 open 으로 펼침
  useEffect(() => {
    const r = requestAnimationFrame(() => setPhase("center"));
    const t = setTimeout(() => setPhase("open"), 320);
    return () => {
      cancelAnimationFrame(r);
      clearTimeout(t);
    };
  }, []);

  // 성공 → Lead 픽셀(중복 제거 eventID)
  const fired = useRef(false);
  useEffect(() => {
    if (!state.ok || fired.current) return;
    fired.current = true;
    if (state.leadId) window.fbq?.("track", "Lead", {}, { eventID: `inquiry_${state.leadId}` });
  }, [state.ok, state.leadId]);

  // 닫힘 시퀀스: open → center 로 모임 → 300ms 후 out(더미로 복귀) → 완료 시 언마운트
  function close() {
    setPhase("center");
    setTimeout(() => setPhase("out"), 300);
    setTimeout(onClose, 640);
  }
  function removeOne(id: string) {
    setLeaving((s) => new Set(s).add(id));
    setTimeout(() => onRemove(id), 260);
  }
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contact.trim() || !agreed) return;
    const fd = new FormData();
    fd.set("contact", contact);
    fd.set("photoIds", items.map((i) => i.id).join(","));
    startTransition(() => formAction(fd));
  }

  // 레이아웃 — 8장 이하면 한 화면에 다 담고(스크롤 X), 9장 이상이면 편안한 크기로 두고 세로 스크롤.
  const N = items.length;
  const SCROLL = N >= 9; // 9장↑ 스크롤 모드
  type Placed = {
    it: CartItem; x: number; y: number; rot: number; photoW: number; photoH: number; side: number; bottom: number; z: number;
  };
  const { cards, contentH } = ((): { cards: Placed[]; contentH: number } => {
    if (!vp || N === 0) return { cards: [], contentH: 0 };
    const { w: W, h: H } = vp;
    const padX = Math.max(16, W * 0.06);
    const topPad = 84;
    const bottomReserve = 150;
    const areaW = W - padX * 2;
    const CARD_ASPECT = 0.8; // 폴라로이드(세로형) 대략 너비/높이

    let cols: number;
    let cardW: number;
    let cellH: number;
    if (SCROLL) {
      // 화면 폭 기준 편안한 칸(약 150px) → 사진을 작게 줄이지 않고 아래로 흐름
      cols = Math.max(2, Math.min(4, Math.floor(areaW / 150)));
      cardW = Math.min((areaW / cols) * 0.92, 240);
      cellH = cardW / CARD_ASPECT + 18; // 세로 간격
    } else {
      // 한 화면에 다 담되 칸 크기를 최대화
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
    return { cards, contentH };
  })();

  const cx = vp ? vp.w / 2 : 0;
  const cy = vp ? vp.h * 0.5 : 0; // 모임 중심
  const gx = origin ? origin.x : cx; // 더미(출발/복귀) 위치
  const gy = origin ? origin.y : cy;

  return (
    <div className="fixed inset-0 z-50 font-kr" role="dialog" aria-modal="true">
      {/* 배경(테이블) — 빈 곳 탭하면 닫힘 */}
      <button
        aria-label="닫기"
        onClick={close}
        className={`absolute inset-0 bg-black/85 backdrop-blur-sm transition-opacity duration-300 ${show ? "opacity-100" : "opacity-0"}`}
      />

      {state.ok ? (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <div>
            <p className="text-xl font-bold text-white">신청 완료!</p>
            <p className="mt-2 text-sm text-white/70">담아둔 사진들로 작가님이 곧 연락드릴 거예요.</p>
            <button
              type="button"
              onClick={() => {
                clear();
                onClose();
              }}
              className="mt-7 cursor-pointer rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
            >
              닫기
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 폴라로이드 레이어 — 9장↑ 세로 스크롤. 빈 곳 탭하면 닫힘 */}
          <div
            onClick={close}
            className={`absolute inset-0 ${SCROLL ? "overflow-y-auto overscroll-contain" : "overflow-hidden"}`}
          >
            <div className="relative w-full" style={{ height: contentH }}>
              {cards.map(({ it, x, y, rot, photoW, photoH, side, bottom, z }) => {
                const isLeaving = leaving.has(it.id);
                // 단계별 변형 — in(더미)·center(모임)·open(펼침)·out(더미 복귀)
                let tf: string;
                let op: number;
                if (isLeaving) {
                  tf = `translate(0,-44px) scale(.6) rotate(${rot}deg)`;
                  op = 0;
                } else if (phase === "open") {
                  tf = `translate(0,0) scale(1) rotate(${rot}deg)`;
                  op = 1;
                } else if (phase === "center") {
                  tf = `translate(${cx - x}px, ${cy - y}px) scale(.28) rotate(0deg)`;
                  op = 1;
                } else if (phase === "in") {
                  tf = `translate(${gx - x}px, ${gy - y}px) scale(.18) rotate(0deg)`;
                  op = 1;
                } else {
                  // out
                  tf = `translate(${gx - x}px, ${gy - y}px) scale(.16) rotate(0deg)`;
                  op = 0;
                }
                // 펼칠 때만 스태거(모임·복귀는 한 덩어리로)
                const delay = phase === "open" ? Math.min(z, 24) * 20 : 0;
                return (
                  <div
                    key={it.id}
                    className="absolute"
                    style={{ left: x, top: y, transform: "translate(-50%,-50%)", zIndex: 10 + z }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeOne(it.id);
                      }}
                      aria-label="빼기"
                      className="block cursor-pointer bg-white shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
                      style={{
                        padding: `${side}px ${side}px ${bottom}px`,
                        borderRadius: 3,
                        transformOrigin: "center",
                        transform: tf,
                        opacity: op,
                        transition: `transform 400ms cubic-bezier(.2,.7,.2,1) ${delay}ms, opacity 320ms ease ${delay}ms`,
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

          {/* 상단 — 안내 + 닫기 */}
          <div
            className={`absolute inset-x-0 top-0 z-[60] flex items-center justify-between px-5 pt-5 transition-opacity duration-300 ${show ? "opacity-100" : "opacity-0"}`}
          >
            <p className="text-sm text-white/75">
              담은 사진 <span className="font-bold text-white">{N}</span>
              <span className="text-white/45"> · 탭하면 빼기</span>
            </p>
            <button
              type="button"
              onClick={close}
              aria-label="닫기"
              className="grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* 하단 — 일괄 상담 CTA */}
          <div
            className={`absolute inset-x-0 bottom-0 z-[60] px-4 pb-6 pt-3 transition-transform duration-300 ${show ? "translate-y-0" : "translate-y-full"}`}
          >
            <div className="mx-auto max-w-md">
              {N === 0 ? (
                <p className="rounded-2xl bg-white/10 py-4 text-center text-sm text-white/70">담은 사진이 없어요.</p>
              ) : !askContact ? (
                <button
                  type="button"
                  onClick={() => setAskContact(true)}
                  className="w-full cursor-pointer rounded-2xl bg-brand py-4 text-base font-bold text-white shadow-pop transition-opacity hover:opacity-90"
                >
                  이 사진들로 무료 상담 신청 ({N})
                </button>
              ) : (
                <form onSubmit={onSubmit} className="rounded-2xl bg-bg p-4 shadow-pop">
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
        </>
      )}
    </div>
  );
}

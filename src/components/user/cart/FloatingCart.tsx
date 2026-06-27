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
  z: number; // 담은 순서 인덱스(최신=큼) → zIndex
  g: number; // 그리드 순서(최신=0, 좌상단) → 펼침 스태거
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
  const [timing, setTiming] = useState(""); // 촬영 희망 시기(한정자, 필수)
  const [region, setRegion] = useState(""); // 희망 지역(선택)
  const [agreed, setAgreed] = useState(false);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [state, formAction, pending] = useActionState(submitCartInquiry, { ok: false });
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const layerRef = useRef<HTMLDivElement>(null);

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
    if (!contact.trim() || !timing || !agreed) return;
    const ids = formFor === "all" || formFor === null ? items.map((i) => i.id) : [formFor];
    const fd = new FormData();
    fd.set("contact", contact);
    fd.set("timing", timing);
    fd.set("region", region);
    fd.set("photoIds", ids.join(","));
    startTransition(() => formAction(fd));
  }

  const TIMINGS = ["1개월 내", "1~3개월", "3개월+", "미정"];

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
      // 그리드 순서는 최신이 좌상단(g=0) — 도크에서 보이던 카드가 위로 펼쳐지게.
      const g = N - 1 - i;
      const row = Math.floor(g / cols);
      const inRow = g - row * cols;
      const itemsInRow = row < rows - 1 ? cols : N - cols * (rows - 1);
      const rowStartX = padX + (areaW - itemsInRow * cellW) / 2;
      const cxc = rowStartX + (inRow + 0.5) * cellW;
      const cyc = topPad + (row + 0.5) * cellH;
      const j = spreadJitter(it.id);
      const x = cxc + j.fx * Math.min(8, cellW * 0.03);
      const y = cyc + j.fy * Math.min(6, cellH * 0.03);
      const ratio = it.w > 0 && it.h > 0 ? it.h / it.w : 1;
      const photoH = Math.min(Math.round(photoW * ratio), Math.max(40, maxPhotoH));
      return { it, x, y, rot: j.rot, photoW, photoH, side, bottom, z: i, g };
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

  // 펼쳐질 때 항상 맨 위에서 시작(이전 스크롤 위치 리셋)
  useIsoLayout(() => {
    if (phase === "spread" && layerRef.current) layerRef.current.scrollTop = 0;
  }, [phase]);

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
        ref={layerRef}
        onClick={phase === "spread" ? close : undefined}
        className={`fixed inset-0 z-[55] ${
          phase === "spread" && SCROLL ? "overflow-y-auto overscroll-contain" : ""
        } ${open ? "" : "pointer-events-none"}`}
      >
        <div className="relative w-full" style={{ height: phase === "spread" && SCROLL ? contentH : "100%" }}>
          {cards.map(({ it, x, y, rot, photoW, photoH, side, bottom, z, g }) => {
            const isLeaving = leaving.has(it.id);
            const j = cartCardJitter(it.id);
            // 펼침 위치가 화면 밖(아래)인 카드 — 스택에서 빠져나오는 게 아니라 제자리에서 페이드만
            // (아래로 내려가며 사라지는 느낌 제거). 이런 카드는 도크에서도 안 보이는 깊은 카드들.
            const belowFold = y > H;
            let tf: string;
            let op: number;
            if (isLeaving) {
              tf = `translate(0,-44px) scale(.6) rotate(${rot}deg)`;
              op = 0;
            } else if (phase === "spread") {
              tf = `translate(0,0) scale(1) rotate(${rot}deg)`;
              op = 1;
            } else if (belowFold) {
              // 화면 밖(아래) 제자리 대기 — 이동 없이 펼침에서 페이드 인
              tf = `translate(0,0) scale(1) rotate(${rot}deg)`;
              op = 0;
            } else if (phase === "center") {
              // 중앙에 모인 스택(도크와 같은 크기·지터)
              tf = `translate(${cx - x + j.dx}px, ${cy - y + j.dy}px) scale(${dockScale}) rotate(${j.rot}deg)`;
              op = g >= 5 ? 0 : 1;
            } else {
              // 도크 — 그 자리의 폴라로이드 더미
              tf = `translate(${dockCx - x + j.dx}px, ${dockCy - y + j.dy}px) scale(${dockScale}) rotate(${j.rot}deg)`;
              op = g >= 5 ? 0 : 1;
            }
            // 펼칠 때만 스태거 — 그리드 위(g 작은 쪽=최신)부터 한 장씩. 모임·이동은 한 덩어리로.
            const delay = !dragging && phase === "spread" ? Math.min(g, 16) * 22 : 0;
            return (
              <div
                key={it.id}
                className="absolute"
                style={{ left: x, top: y, transform: "translate(-50%,-50%)", zIndex: 10 + z }}
              >
                <div
                  ref={(el) => {
                    if (el) cardRefs.current.set(it.id, el);
                    else cardRefs.current.delete(it.id);
                  }}
                  role="button"
                  tabIndex={0}
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
                  aria-label={open ? "크게 보기" : "찜 펼치기 (드래그로 이동)"}
                  className="relative block cursor-pointer select-none bg-white shadow-[0_10px_28px_rgba(0,0,0,0.4)]"
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
                  {/* 펼침 그리드에서만 — 우상단 작은 삭제(휴지통) */}
                  {phase === "spread" && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeOne(it.id);
                      }}
                      aria-label="삭제"
                      style={{ top: side + 2, right: side + 2 }}
                      className="absolute grid h-6 w-6 cursor-pointer place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75"
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path
                          d="M5 7h14M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                </div>
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
                <p className="mt-2 text-sm text-white/70">찜한 사진으로 작가님이 곧 연락드릴 거예요.</p>
              </div>
            </div>
          ) : (
            <>
              {/* 상단 — 확대 중이 아닐 때만: 좌 뒤로가기(닫기) + 우 담은 사진 수. 확대 중엔 FocusedPhoto가 자체 뒤로가기 */}
              {!focused && (
                <div className="pointer-events-none fixed inset-x-0 top-0 z-[62] flex items-center justify-between px-5 pt-5">
                  <button
                    type="button"
                    onClick={close}
                    aria-label="뒤로"
                    className="pointer-events-auto grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <p className="text-sm text-white/75">
                    찜한 사진 <span className="font-bold text-white">{N}</span>
                  </p>
                </div>
              )}

              {/* 하단 — 상담 CTA(항상 유지). 한 장 크게 볼 땐 '이 사진으로'로 전환 */}
              <div className="fixed inset-x-0 bottom-0 z-[62] px-4 pb-6 pt-3">
                <div className="mx-auto max-w-md">
                  {formFor !== null ? (
                    <form onSubmit={onSubmit} className="rounded-2xl bg-bg p-4 shadow-pop">
                      <p className="mb-2.5 text-sm font-semibold text-fg">
                        이 사진으로 상담 신청
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
                      {/* 한정자 — 희망 시기(필수, 한 번 탭) */}
                      <p className="mt-3 text-xs font-medium text-muted">촬영 희망 시기</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {TIMINGS.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setTiming(t)}
                            className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors ${
                              timing === t
                                ? "border-brand bg-brand text-white"
                                : "border-line-strong bg-surface text-fg/70 hover:border-brand/50"
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                      {/* 한정자 — 지역(선택) */}
                      <input
                        type="text"
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        placeholder="희망 지역 (선택) · 예: 서울, 부산, 온라인"
                        className="mt-2.5 h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-base outline-none transition-colors placeholder:text-fg/30 focus:border-brand"
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
                        disabled={!contact.trim() || !timing || !agreed || pending}
                        className="mt-3 h-12 w-full cursor-pointer rounded-xl bg-brand text-base font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {pending ? "신청 중…" : "상담 신청하기"}
                      </button>
                    </form>
                  ) : focused && items.some((i) => i.id === focused.id) ? (
                    <button
                      type="button"
                      onClick={() => setFormFor(focused.id)}
                      className="w-full cursor-pointer rounded-2xl bg-brand py-4 text-base font-bold text-white shadow-pop transition-opacity hover:opacity-90"
                    >
                      이 사진으로 무료 상담 신청
                    </button>
                  ) : (
                    // 찜 보관함 — 블래스트 없음. 사진을 탭하면 그 사진(=그 작가)로 단일 문의
                    <p className="text-center text-sm text-white/55">사진을 탭하면 크게 보고 상담할 수 있어요</p>
                  )}
                </div>
              </div>

              {/* 탭한 사진 중앙 확대 — 상담 CTA 는 하단 바가 담당 */}
              {focused && items.some((i) => i.id === focused.id) && (
                <FocusedPhoto
                  item={items.find((i) => i.id === focused.id)!}
                  fromRect={focused.rect}
                  vp={vp}
                  onBack={() => {
                    setFocused(null);
                    if (formFor && formFor !== "all") setFormFor(null);
                  }}
                  onRemove={(id) => {
                    setFocused(null);
                    if (formFor && formFor !== "all") setFormFor(null);
                    removeOne(id);
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

// 탭한 사진을 카드 자리 ↔ 화면 중앙으로 확대/복귀(transform 상태 토글, 측정 없음 → 확실히 모션 적용).
function FocusedPhoto({
  item,
  fromRect,
  vp,
  onBack,
  onRemove,
}: {
  item: CartItem;
  fromRect: DOMRect;
  vp: { w: number; h: number } | null;
  onBack: () => void;
  onRemove: (id: string) => void;
}) {
  // entered=false: 카드 자리(작게) / true: 화면 중앙(원래 크기)
  const [entered, setEntered] = useState(false);
  const closing = useRef(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(r);
  }, []);
  // 닫힘 — 카드 자리로 되돌아간 뒤 언마운트
  function leave(after: () => void) {
    if (closing.current) return;
    closing.current = true;
    setEntered(false);
    setTimeout(after, 420);
  }

  const vw = vp?.w ?? 360;
  const vh = vp?.h ?? 720;
  const photoW = Math.min(vw * 0.82, 340);
  const ratio = item.w > 0 && item.h > 0 ? item.h / item.w : 1;
  const side = Math.max(8, Math.round(photoW * 0.05));
  const bottomPad = Math.max(20, Math.round(photoW * 0.14));
  const photoH = Math.min(Math.round(photoW * ratio), Math.round(vh * 0.46));

  // 카드 자리 → 중앙 변환을 직접 계산(렌더 시점). 중앙은 px-6/pb-16 영역의 중심.
  const cardFullW = photoW + side * 2;
  const targetCx = vw / 2;
  const targetCy = (vh - 64) / 2;
  const fromCx = fromRect.left + fromRect.width / 2;
  const fromCy = fromRect.top + fromRect.height / 2;
  const dx = fromCx - targetCx;
  const dy = fromCy - targetCy;
  const s = Math.max(0.05, fromRect.width / cardFullW);
  const startTf = `translate(${dx}px, ${dy}px) scale(${s})`;

  return (
    <div className="fixed inset-0 z-[58] font-kr">
      {/* 딤 — 빈 곳/사진 탭하면 그리드로 */}
      <div
        onClick={() => leave(onBack)}
        aria-hidden
        className="absolute inset-0 bg-black/78 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: entered ? 1 : 0 }}
      />

      {/* 좌상단 뒤로가기 */}
      <button
        type="button"
        onClick={() => leave(onBack)}
        aria-label="뒤로"
        className="absolute left-5 top-5 z-10 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-all duration-300 hover:bg-white/25"
        style={{ opacity: entered ? 1 : 0 }}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* 사진 — 카드 자리(작게) ↔ 화면 중앙(원래 크기) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 pb-16">
        <div
          className="relative bg-white shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
          style={{
            padding: `${side}px ${side}px ${bottomPad}px`,
            borderRadius: 4,
            transformOrigin: "center",
            transform: entered ? "translate(0,0) scale(1)" : startTf,
            transition: "transform 440ms cubic-bezier(.22,1,.36,1)",
          }}
        >
          <img
            src={item.src}
            alt=""
            draggable={false}
            style={{ display: "block", width: photoW, height: photoH, objectFit: "cover", borderRadius: 2 }}
          />
        </div>
      </div>

      {/* 보조 액션 — 무료상담 바(bottom-0) 바로 위 */}
      <div
        className="absolute inset-x-0 bottom-[88px] z-[60] flex items-center justify-center gap-2 px-6 transition-opacity duration-300"
        style={{ opacity: entered ? 1 : 0 }}
      >
        <Link
          href={`/photos/${item.id}`}
          className="rounded-full bg-white/15 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/25"
        >
          이 사진 게시물 보러가기
        </Link>
        <button
          type="button"
          onClick={() => leave(() => onRemove(item.id))}
          className="rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold text-white/85 backdrop-blur transition-colors hover:bg-white/20"
        >
          삭제하기
        </button>
      </div>
    </div>
  );
}

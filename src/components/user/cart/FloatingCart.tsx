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
import { useRouter } from "next/navigation";
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
    rot: (h % 19) - 9, // -9 ~ 9도(살짝 더 삐뚤빼뚤 — 흩어놓은 폴라로이드 느낌)
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
  const router = useRouter();
  // 단계: dock(가장자리) → center(중앙 스택) → spread(펼침). 열고 닫을 때 중앙을 경유.
  const [phase, setPhase] = useState<"dock" | "center" | "spread">("dock");
  const open = phase !== "dock";
  const [view, setView] = useState<{ right: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ active: false, moved: false, startX: 0, startY: 0, baseRight: 0, baseTop: 0 });
  const [vp, setVp] = useState<{ w: number; h: number } | null>(null);
  // 탭한 사진 id — 실제 카드 자체가 중앙으로 와서 확대(복제본 없음)
  const [focused, setFocused] = useState<string | null>(null);
  const [focusScroll, setFocusScroll] = useState(0); // 확대 시점의 스크롤 오프셋(중앙 보정용)
  const [formFor, setFormFor] = useState<string | null>(null); // null / photoId(단일) / "selected"(선택 묶음)
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contact, setContact] = useState("");
  const [timing, setTiming] = useState(""); // 촬영 희망 시기(한정자, 필수)
  const [region, setRegion] = useState(""); // 희망 지역(선택)
  const [agreed, setAgreed] = useState(false);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [shareToast, setShareToast] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(false); // 확대 보기 더보기(⋯) 메뉴
  const [closing, setClosing] = useState(false); // 닫는 중 — 카드 트랜지션을 더 빠르게
  // 길게 누르기(롱프레스) 추적 — 타이머/발동여부/시작좌표
  const longPress = useRef<{ timer: number | null; fired: boolean; x: number; y: number }>({
    timer: null,
    fired: false,
    x: 0,
    y: 0,
  });
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

  // 펼친 동안 배경(body) 스크롤 잠금 — 블러 백드롭 뒤로 페이지가 같이 스크롤되던 문제 방지.
  // 사진이 적어 레이어가 스크롤 컨테이너가 아닐 때도 제스처가 body로 새지 않게 함.
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const { body } = document;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [open]);

  // ── 폰 내장 뒤로가기: 논리적 '깊이'마다 히스토리 가드 1개 (열림=1, 확대/선택=2). ──
  // 깊이가 늘면 가드를 push, 줄면 제거. 뒤로(popstate)는 한 단계씩만 닫는다(뒤 페이지로 안 샘).
  // 핵심: pushState/back 은 전부 effect(렌더 후)에서만 호출 → popstate 핸들러 '안'에서
  // 재push 하던 이전 방식의 모바일+Next 라우터 비신뢰성 문제를 피한다.
  const histRef = useRef({ pushed: 0, browserPopped: false, ignore: 0 });
  const navDepth = !open ? 0 : focused || selectMode ? 2 : 1;

  useEffect(() => {
    const h = histRef.current;
    // 깊이 증가(enter) → 가드 push
    while (h.pushed < navDepth) {
      window.history.pushState({ ...window.history.state, samaeCart: true }, "");
      h.pushed += 1;
    }
    // 깊이 감소(exit) → 가드 제거
    while (h.pushed > navDepth) {
      h.pushed -= 1;
      if (h.browserPopped) {
        h.browserPopped = false; // 뒤로로 줄어듦: 브라우저가 이미 pop 함
      } else {
        h.ignore += 1; // UI 로 줄어듦: 우리가 pop(그 popstate 는 무시)
        window.history.back();
      }
    }
  }, [navDepth]);

  // popstate(뒤로) — 현재 상태/함수는 ref 로 읽어 항상 최신.
  const onPopRef = useRef<() => void>(() => {});
  onPopRef.current = () => {
    const h = histRef.current;
    if (h.ignore > 0) {
      h.ignore -= 1; // 우리가 부른 history.back() — 무시
      return;
    }
    // 사용자 뒤로: 브라우저가 가드 1개 소비 → 한 단계만 닫는다.
    h.browserPopped = true;
    if (focused) {
      setPhotoMenu(false);
      setFocused(null);
    } else if (selectMode) {
      exitSelect();
    } else if (open) {
      close();
    } else {
      h.browserPopped = false;
    }
  };
  useEffect(() => {
    const onPop = () => onPopRef.current();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
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
  // 닫힘: 펼침 → 중앙 스택 → 도크 복귀 (열 때보다 빠르게 — 머무름·트랜지션 단축)
  function close() {
    setFocused(null);
    setFormFor(null);
    setSelectMode(false);
    setSelectedIds(new Set());
    setClosing(true);
    setPhase("center");
    window.setTimeout(() => setPhase("dock"), 130); // 중앙 머무름 300→130ms
    window.setTimeout(() => setClosing(false), 430); // 닫힘 트랜지션 끝나면 해제
  }
  function exitSelect() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setFormFor(null);
  }
  // 빈 곳(사진 외 여백) 탭 — 선택 모드면 선택만 해제, 확대 중이면 그리드로, 그 외엔 닫힘
  function dismissOverlay() {
    if (selectMode) exitSelect();
    else if (focused) setFocused(null);
    else close();
  }
  // 상담 페이지로 이동 — 찜 모달을 즉시 닫고(도크) 이동
  function leaveToInquiry(href: string) {
    setFocused(null);
    setFormFor(null);
    setSelectMode(false);
    setSelectedIds(new Set());
    setPhase("dock");
    // 페이지 이동이므로 가드 동기화(history.back)가 router.push 와 경쟁하지 않게 카운트만 비움.
    histRef.current.pushed = 0;
    router.push(href);
  }
  function toggleSelect(id: string) {
    setSelectedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function deleteSelected() {
    const ids = [...selectedIds];
    exitSelect();
    ids.forEach((id) => removeOne(id));
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
  // 사진 페이지 링크 공유 — 모바일은 네이티브 공유 시트(navigator.share), 미지원(데스크톱)은 링크 복사.
  async function sharePhotos(ids: string[]) {
    if (typeof window === "undefined" || ids.length === 0) return;
    const { origin } = window.location;
    const links = ids.map((id) => `${origin}/photos/${id}`);
    try {
      if (navigator.share) {
        await navigator.share(
          ids.length === 1
            ? { title: "samae — 관심 사진", url: links[0] }
            : { title: "samae — 관심 사진", text: `관심 사진 ${ids.length}장\n${links.join("\n")}` }
        );
        return;
      }
    } catch {
      return; // 사용자가 공유 취소 — 조용히 무시
    }
    try {
      await navigator.clipboard.writeText(links.join("\n"));
      setShareToast(true);
      setTimeout(() => setShareToast(false), 1600);
    } catch {
      /* 클립보드 불가 — 무시 */
    }
  }

  // ── 펼침 그리드 카드 길게 누르기 → 선택 모드 진입 + 그 사진 선택 ──
  const LONG_PRESS_MS = 420;
  function cardPointerDown(e: React.PointerEvent, id: string) {
    startDrag(e); // 도크 단계 드래그(펼침 단계에선 내부에서 무시됨)
    if (phase !== "spread" || selectMode) return;
    longPress.current = { timer: null, fired: false, x: e.clientX, y: e.clientY };
    longPress.current.timer = window.setTimeout(() => {
      longPress.current.fired = true;
      setSelectMode(true);
      setSelectedIds(new Set([id]));
      navigator.vibrate?.(15); // 햅틱(지원 기기만)
    }, LONG_PRESS_MS);
  }
  function cardPointerMove(e: React.PointerEvent) {
    moveDrag(e);
    const lp = longPress.current;
    // 스크롤/이동이 감지되면 롱프레스 취소
    if (lp.timer != null && (Math.abs(e.clientX - lp.x) > 8 || Math.abs(e.clientY - lp.y) > 8)) {
      clearTimeout(lp.timer);
      lp.timer = null;
    }
  }
  function cardPointerUp() {
    endDrag();
    if (longPress.current.timer != null) {
      clearTimeout(longPress.current.timer);
      longPress.current.timer = null;
    }
  }
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contact.trim() || !timing || !agreed) return;
    const ids =
      formFor === "selected" ? [...selectedIds] : formFor && formFor !== "all" ? [formFor] : items.map((i) => i.id);
    const fd = new FormData();
    fd.set("contact", contact);
    fd.set("timing", timing);
    fd.set("region", region);
    fd.set("photoIds", ids.join(","));
    startTransition(() => formAction(fd));
  }

  const TIMINGS = ["1개월 내", "1~3개월", "3개월+", "미정"];

  // ── 펼침 레이아웃(메이슨리) — 열별로 높이를 누적해 채운다. 그리드와 달리 셀 높이를
  //    고정하지 않아, 가로로 긴 사진 아래에 빈틈이 안 생기고 각 사진은 원본 비율을 유지한다. ──
  const { cards, contentH, cardW, SCROLL } = ((): {
    cards: Placed[];
    contentH: number;
    cardW: number;
    SCROLL: boolean;
  } => {
    if (!vp || N === 0) return { cards: [], contentH: 0, cardW: CART_W, SCROLL: false };
    const { w: W, h: H } = vp;
    const padX = Math.max(16, W * 0.06);
    const topPad = 84;
    const bottomReserve = 150;
    const areaW = W - padX * 2;
    const TARGET_COL = 184; // 목표 열 폭 → 카드 ~160px. 화면 넓으면 같은 크기로 열만 늘림
    const GAP_Y = 16; // 같은 열 카드 세로 간격

    const cols = Math.max(2, Math.min(N, Math.round(areaW / TARGET_COL)));
    const colW = areaW / cols;
    const cardW = Math.min(colW * 0.92, 240);
    const effCols = Math.min(N, cols); // 실제 사용 열 수(사진 1장이면 1열)
    const xLeft = padX + (areaW - effCols * colW) / 2; // 사용 열만큼 가로 가운데 정렬

    const side = Math.max(4, Math.round(cardW * 0.038));
    const bottom = Math.max(14, Math.round(cardW * 0.16));
    const photoW = Math.round(cardW - side * 2);
    const maxPhotoH = Math.round(cardW * 1.7); // 극단적 세로 사진만 상한(나머지는 자연 비율 그대로)

    // 최신(g=0)부터 '가장 낮은(짧은) 열'에 차례로 투입 → 열 높이 균형, 아래 빈틈 최소화.
    const colBottom: number[] = new Array(effCols).fill(topPad); // 각 열의 현재 바닥 y
    const place: { cx: number; cy: number; photoH: number }[] = new Array(N);
    for (const { it, i } of items
      .map((it, i) => ({ it, i, g: N - 1 - i }))
      .sort((a, b) => a.g - b.g)) {
      const ratio = it.w > 0 && it.h > 0 ? it.h / it.w : 1;
      const photoH = Math.min(Math.max(40, Math.round(photoW * ratio)), maxPhotoH);
      const cardH = photoH + side + bottom;
      let c = 0;
      for (let k = 1; k < effCols; k++) if (colBottom[k] < colBottom[c]) c = k;
      place[i] = { cx: xLeft + (c + 0.5) * colW, cy: colBottom[c] + cardH / 2, photoH };
      colBottom[c] += cardH + GAP_Y;
    }

    const maxBottom = Math.max(...colBottom) - GAP_Y; // 마지막 GAP 제거
    const gridH = maxBottom - topPad;
    const avail = Math.max(180, H - topPad - bottomReserve);
    const SCROLL = gridH > avail; // 한 화면 넘으면 스크롤
    const yOffset = SCROLL ? 0 : Math.max(0, (avail - gridH) / 2); // 적으면 세로 중앙 정렬
    const contentH = SCROLL ? maxBottom + 32 : H;

    const cards = items.map((it, i) => {
      const g = N - 1 - i; // 최신이 좌상단(g=0) — 펼침 스태거 순서
      const p = place[i];
      const j = spreadJitter(it.id);
      const x = p.cx + j.fx * Math.min(10, colW * 0.04);
      const y = p.cy + yOffset + j.fy * 5; // 세로는 누적 배치라 작은 흔들림만(겹침 방지)
      return { it, x, y, rot: j.rot, photoW, photoH: p.photoH, side, bottom, z: i, g };
    });
    return { cards, contentH, cardW, SCROLL };
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

  // ── 방금 담은 카드 — 출발 사진 자리에서 도크로 부드럽게 날아와 안착(WAAPI) ──
  // 시작·끝 키프레임을 같은 tfAt 형태로 계산(중심 오프셋 일관) → 시작 위치 어긋남 없음.
  const newestId = N > 0 ? items[items.length - 1].id : null;
  useIsoLayout(() => {
    if (!newestId || phase !== "dock") return;
    const from = consumeFlyFrom(newestId); // 한 번만 소비 → StrictMode 재실행 시 자연 무시
    if (!from || !from.width) return;
    const el = cardRefs.current.get(newestId);
    if (!el) return;
    const rest = el.style.transform; // 현재 도크 포즈(인라인, tfAt 형태)
    if (!rest) return;
    const nc = cards[cards.length - 1]; // 최신 카드 = 마지막
    if (!nc || nc.it.id !== newestId) return;
    const ncW = nc.photoW + nc.side * 2;
    const ncH = nc.photoH + nc.side + nc.bottom;
    const fromCx = from.left + from.width / 2;
    const fromCy = from.top + from.height / 2;
    const s = Math.max(0.05, from.width / ncW);
    // 출발: 사진 자리·사진 크기·회전 0 (도크 포즈와 같은 좌표계)
    const startTf = `translate(${fromCx - ncW / 2}px, ${fromCy - ncH / 2}px) scale(${s}) rotate(0deg)`;
    el.animate(
      [
        { transform: startTf, offset: 0 },
        { transform: rest, offset: 1 },
      ],
      { duration: 560, easing: "cubic-bezier(.42,0,.18,1)" }
    );
  }, [newestId, count, phase, consumeFlyFrom, cards]);

  if (!vp || N === 0) return null;

  return (
    <>
      {/* 배경(테이블) — 펼침 시에만 보이고, 빈 곳 탭하면 닫힘 */}
      <div
        aria-hidden={!open}
        onClick={open ? dismissOverlay : undefined}
        className={`fixed inset-0 z-[50] bg-black/85 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* 카드 레이어 — 도크↔중앙↔펼침↔확대 동일 엘리먼트가 변형(복제본 없음) */}
      <div
        ref={layerRef}
        onClick={phase === "spread" ? dismissOverlay : undefined}
        // 확대(상세) 중엔 스크롤 고정 — 휠/트랙패드로 스크롤돼도 즉시 focusScroll 위치로 되돌림.
        // (터치는 [touch-action:none]이 차단. overflow-auto는 카드 위치 기준 유지 위해 그대로 둠)
        onScroll={focused ? (e) => (e.currentTarget.scrollTop = focusScroll) : undefined}
        className={`fixed inset-0 z-[55] ${
          phase === "spread" && SCROLL ? "overflow-y-auto overscroll-contain" : ""
        } ${focused ? "[touch-action:none]" : ""} ${open ? "" : "pointer-events-none"}`}
      >
        <div className="relative w-full" style={{ height: phase === "spread" && SCROLL ? contentH : "100%" }}>
          {cards.map(({ it, x, y, rot, photoW, photoH, side, bottom, z, g }) => {
            const isLeaving = leaving.has(it.id);
            const j = cartCardJitter(it.id);
            const belowFold = y > H; // 펼침 위치가 화면 밖(아래) — 이동 없이 제자리 페이드
            // 위치를 전부 transform 으로 처리(left/top 은 0 고정) → 도크 좌표가 x,y 와 무관해
            // 담기/빼기로 N 이 바뀌어도 도크 카드가 흔들리지 않음.
            const cardW = photoW + side * 2;
            const cardH = photoH + side + bottom;
            const tfAt = (X: number, Y: number, s: number, r: number) =>
              `translate(${X - cardW / 2}px, ${Y - cardH / 2}px) scale(${s}) rotate(${r}deg)`;
            const isFocused = focused === it.id;
            const anyFocused = focused != null;
            let tf: string;
            let op: number;
            if (isLeaving) {
              tf = tfAt(x, y - 44, 0.6, rot);
              op = 0;
            } else if (isFocused) {
              // 실제 카드가 화면 중앙으로 와서 확대(복제 없음). 스크롤 보정 포함.
              // 가로 폭 + 세로 높이 둘 다 제약 → 세로로 긴 사진이 하단 액션바에 가리지 않게.
              const maxW = Math.min(W * 0.82, 360);
              const maxH = H * 0.64; // 상단 안전영역 + 하단 액션바(≈150px) 회피
              const focusScale = Math.min(maxW / cardW, maxH / cardH);
              tf = tfAt(W / 2, focusScroll + H * 0.42, focusScale, 0);
              op = 1;
            } else if (phase === "spread") {
              tf = tfAt(x, y, 1, rot);
              op = anyFocused ? 0 : selectMode && !selectedIds.has(it.id) ? 0.5 : 1;
            } else if (belowFold) {
              tf = tfAt(x, y, 1, rot);
              op = 0;
            } else if (phase === "center") {
              tf = tfAt(cx + j.dx, cy + j.dy, dockScale, j.rot);
              op = g >= 5 ? 0 : 1;
            } else {
              // 도크 — x,y 무관 고정 좌표
              tf = tfAt(dockCx + j.dx, dockCy + j.dy, dockScale, j.rot);
              op = g >= 5 ? 0 : 1;
            }
            // 펼칠 때만 스태거 — 그리드 위(g 작은 쪽=최신)부터 한 장씩. 포커스 이동은 즉시.
            const delay = !dragging && phase === "spread" && !anyFocused ? Math.min(g, 16) * 22 : 0;
            return (
              <div
                key={it.id}
                className="absolute"
                style={{ left: 0, top: 0, zIndex: isFocused ? 1000 : 10 + z }}
              >
                <div
                  ref={(el) => {
                    if (el) cardRefs.current.set(it.id, el);
                    else cardRefs.current.delete(it.id);
                  }}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(e) => cardPointerDown(e, it.id)}
                  onPointerMove={cardPointerMove}
                  onPointerUp={cardPointerUp}
                  onClick={(e) => {
                    e.stopPropagation();
                    // 롱프레스로 선택된 직후의 클릭은 무시(토글/포커스 방지)
                    if (longPress.current.fired) {
                      longPress.current.fired = false;
                      return;
                    }
                    if (phase === "spread") {
                      if (selectMode) toggleSelect(it.id);
                      else if (focused === it.id) setFocused(null);
                      else {
                        setFocusScroll(layerRef.current?.scrollTop ?? 0);
                        setPhotoMenu(false);
                        setFocused(it.id);
                      }
                    } else if (phase === "dock") {
                      if (drag.current.moved) drag.current.moved = false;
                      else startOpen();
                    }
                    // center: 전환 중 — 무시
                  }}
                  aria-label={open ? (selectMode ? "선택/해제" : "크게 보기") : "관심 사진 펼치기 (드래그로 이동)"}
                  className="relative block cursor-pointer select-none bg-white shadow-[0_10px_28px_rgba(0,0,0,0.4)]"
                  style={{
                    padding: `${side}px ${side}px ${bottom}px`,
                    borderRadius: 3,
                    transformOrigin: "center",
                    transform: tf,
                    opacity: op,
                    pointerEvents: anyFocused && !isFocused ? "none" : "auto",
                    touchAction: open ? "auto" : "none",
                    transition: dragging
                      ? "none"
                      : closing
                        ? `transform 290ms cubic-bezier(.4,0,.2,1) ${delay}ms, opacity 200ms ease ${delay}ms`
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
                  {/* 선택 모드 — 우상단 체크 표시 */}
                  {phase === "spread" && selectMode && (
                    <span
                      style={{ top: side + 2, right: side + 2 }}
                      className={`absolute grid h-6 w-6 place-items-center rounded-full border-2 ${
                        selectedIds.has(it.id)
                          ? "border-brand bg-brand text-white"
                          : "border-white bg-black/25 text-transparent"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
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
                <p className="mt-2 text-sm text-white/70">관심 사진으로 작가님이 곧 연락드릴 거예요.</p>
              </div>
            </div>
          ) : (
            <>
              {/* 상단(확대 중) — 좌: 닫기(그리드로) / 우: 공유 · 더보기(게시물 보기·삭제) */}
              {focused && (
                <>
                  {/* 메뉴 바깥 탭하면 메뉴만 닫힘 */}
                  {photoMenu && (
                    <button
                      type="button"
                      aria-hidden
                      onClick={() => setPhotoMenu(false)}
                      className="fixed inset-0 z-[61] cursor-default"
                    />
                  )}
                  <div className="fixed inset-x-0 top-0 z-[62] flex items-start justify-between px-5 pt-5">
                    {/* 닫기 — 그리드로 복귀 */}
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoMenu(false);
                        setFocused(null);
                      }}
                      aria-label="닫기"
                      className="grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25"
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>

                    {/* 우측 — 공유 + 더보기 */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => focused && sharePhotos([focused])}
                        aria-label="공유"
                        className="grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25"
                      >
                        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 16V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>

                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setPhotoMenu((v) => !v)}
                          aria-label="더보기"
                          aria-expanded={photoMenu}
                          className="grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25"
                        >
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                            <circle cx="5" cy="12" r="1.6" />
                            <circle cx="12" cy="12" r="1.6" />
                            <circle cx="19" cy="12" r="1.6" />
                          </svg>
                        </button>
                        {photoMenu && (
                          <div className="absolute right-0 top-11 min-w-[140px] overflow-hidden rounded-xl bg-bg py-1 shadow-pop">
                            <button
                              type="button"
                              onClick={() => {
                                setPhotoMenu(false);
                                if (focused) leaveToInquiry(`/photos/${focused}`);
                              }}
                              className="block w-full cursor-pointer px-4 py-2.5 text-left text-sm font-medium text-fg transition-colors hover:bg-fg/[0.06]"
                            >
                              게시물 보기
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const id = focused;
                                setPhotoMenu(false);
                                setFocused(null);
                                setFormFor(null);
                                if (id) removeOne(id);
                              }}
                              className="block w-full cursor-pointer px-4 py-2.5 text-left text-sm font-medium text-brand transition-colors hover:bg-brand/10"
                            >
                              삭제
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* 상단 — 확대 중이 아닐 때. 일반: 뒤로 / 찜 수(중앙) / 선택. 선택모드: 취소 / N장 선택 / 삭제 */}
              {!focused && (
                <div className="pointer-events-none fixed inset-x-0 top-0 z-[62] flex items-center justify-between px-5 pt-5">
                  {selectMode ? (
                    <>
                      <button
                        type="button"
                        onClick={exitSelect}
                        className="pointer-events-auto cursor-pointer rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/25"
                      >
                        취소
                      </button>
                      <p className="text-sm text-white/75">
                        <span className="font-bold text-white">{selectedIds.size}</span>장 선택
                      </p>
                      <div className="pointer-events-auto flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => sharePhotos([...selectedIds])}
                          disabled={selectedIds.size === 0}
                          className="cursor-pointer rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/25 disabled:cursor-not-allowed disabled:bg-[#3a3a3a] disabled:text-white/35 disabled:hover:bg-[#3a3a3a]"
                        >
                          공유
                        </button>
                        <button
                          type="button"
                          onClick={deleteSelected}
                          disabled={selectedIds.size === 0}
                          className="cursor-pointer rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/25 disabled:cursor-not-allowed disabled:bg-[#3a3a3a] disabled:text-white/35 disabled:hover:bg-[#3a3a3a]"
                        >
                          삭제
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
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
                        관심 사진 <span className="font-bold text-white">{N}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => setSelectMode(true)}
                        className="pointer-events-auto cursor-pointer rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/25"
                      >
                        선택
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* 하단 — 상담 CTA(항상 유지). 한 장 크게 볼 땐 '이 사진으로'로 전환 */}
              <div className="fixed inset-x-0 bottom-0 z-[62] px-4 pb-6 pt-3">
                <div className="mx-auto max-w-md">
                  {formFor !== null ? (
                    <form onSubmit={onSubmit} className="rounded-2xl bg-bg p-4 shadow-pop">
                      <p className="mb-2.5 text-sm font-semibold text-fg">
                        {formFor === "selected" ? `선택한 ${selectedIds.size}장으로 상담 신청` : "이 사진으로 상담 신청"}
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
                  ) : selectMode ? (
                    <button
                      type="button"
                      onClick={() =>
                        selectedIds.size > 0 &&
                        leaveToInquiry(`/inquiry/cart?ids=${[...selectedIds].join(",")}`)
                      }
                      disabled={selectedIds.size === 0}
                      className="w-full cursor-pointer rounded-2xl bg-brand py-4 text-base font-bold text-white shadow-pop transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[#3a3a3a] disabled:text-white/40 disabled:shadow-none disabled:hover:opacity-100"
                    >
                      {selectedIds.size > 0 ? `선택한 ${selectedIds.size}장 상담 신청` : "상담할 사진을 선택하세요"}
                    </button>
                  ) : focused && items.some((i) => i.id === focused) ? (
                    <button
                      type="button"
                      onClick={() => leaveToInquiry(`/inquiry/photo/${focused}`)}
                      className="w-full cursor-pointer rounded-2xl bg-brand py-4 text-base font-bold text-white shadow-pop transition-opacity hover:opacity-90"
                    >
                      이 사진으로 무료 상담 신청
                    </button>
                  ) : (
                    // 찜 보관함 — 블래스트 없음. 사진을 탭하면 그 사진(=그 작가)로 단일 문의
                    <p className="text-center">
                      <span className="inline-block rounded-full bg-black/45 px-4 py-2 text-sm font-medium text-white/85 backdrop-blur-sm">
                        사진을 탭하면 크게 보고 상담할 수 있어요
                      </span>
                    </p>
                  )}
                </div>
              </div>

              {/* 공유 클립보드 복사 토스트(네이티브 공유 미지원 시) */}
              {shareToast && (
                <div className="pointer-events-none fixed inset-x-0 bottom-[150px] z-[70] flex justify-center px-6">
                  <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black shadow-pop">
                    링크가 복사됐어요
                  </span>
                </div>
              )}

            </>
          )}
        </>
      )}
    </>
  );
}

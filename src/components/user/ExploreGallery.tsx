"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { GalleryPhoto } from "@/lib/discovery";
import { cn } from "@/lib/cn";
import { assignColumnAccents, type AccentColor } from "@/lib/seeded-shuffle";
import { SearchIcon } from "@/components/user/icons";
import { AddToCartButton } from "@/components/user/cart/AddToCartButton";
import { EmptyState } from "@/components/ui";

const fmt = new Intl.NumberFormat("ko-KR");
const STEP = 48; // 스크롤마다 더 보여줄 사진 수(메모리에서 즉시 노출)
const TUTORIAL_SEEN_KEY = "samae:tutorial-seen"; // 일반 유저 첫 방문 튜토리얼 열람 여부
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function useColumnCount() {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(2);
  const [ready, setReady] = useState(false);

  useIsoLayoutEffect(() => {
    if (!node) {
      setReady(false);
      return;
    }
    const compute = () => {
      setCols(Math.max(2, Math.min(7, Math.round(node.clientWidth / 220))));
      setReady(true);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);

  return { cols, ready, setNode };
}

// 높이 균형 그리디 분배 — 각 사진을 가장 짧은 컬럼에 넣는다.
// 순서가 고정이면 prefix-stable: 뒤에 더 추가돼도 앞 사진들의 컬럼/위치가 안 바뀜(재정렬 없음).
function buildColumns(photos: GalleryPhoto[], colCount: number): GalleryPhoto[][] {
  const cols: GalleryPhoto[][] = Array.from({ length: colCount }, () => []);
  const heights = new Array(colCount).fill(0);
  for (const p of photos) {
    const ratio = p.width > 0 && p.height > 0 ? p.height / p.width : 1; // 단위 폭당 상대 높이
    let min = 0;
    for (let c = 1; c < colCount; c++) if (heights[c] < heights[min]) min = c;
    cols[min].push(p);
    heights[min] += ratio;
  }
  return cols;
}

// 온보딩 시 비-스포트라이트 카드가 흩어질 변형 — 황금각으로 사방 방사 분산(결정적).
function scatterTransform(i: number): string {
  const a = i * 2.39996323; // 황금각(rad) → 균일한 방사 분포
  const dist = 540 + (i % 6) * 90;
  const x = Math.round(Math.cos(a) * dist);
  const y = Math.round(Math.sin(a) * dist);
  const r = ((i * 53) % 90) - 45;
  return `translate(${x}px, ${y}px) rotate(${r}deg) scale(0.38)`;
}
function scatterDelay(i: number): number {
  return Math.min(i, 14) * 22; // 앞 카드부터 물결치듯(최대 ~308ms)
}

// 탐색 갤러리 — 서버가 셔플된 풀을 내려주고, 클라이언트는 메모리에서 점진 노출(네트워크 없음).
// JS 컬럼 버킷으로 기존 사진은 절대 재배치되지 않음.
export function ExploreGallery({
  photos,
  query,
  likedIds = [],
  spotlightId,
  loggedIn = false,
  spotlightFirstOnGeneral = false,
}: {
  photos: GalleryPhoto[];
  query?: string;
  likedIds?: string[];
  // 광고 유입 온보딩 — 이 id 사진(좌상단 첫 카드)만 남기고 나머지를 어둡게+뿌옇게.
  spotlightId?: string;
  // 로그인 여부 — 로그인 유저에게는 일반 첫 방문 튜토리얼을 띄우지 않음.
  loggedIn?: boolean;
  // 일반 첫 방문 튜토리얼에서 좌상단 첫 사진을 스포트라이트로 강조(슬러그 없는 탐색 메인 전용).
  // false 면 강조 사진 없이 배경 전체만 어둡게(카테고리 slug 페이지).
  spotlightFirstOnGeneral?: boolean;
}) {
  const [showPrice, setShowPrice] = useState(false);
  const [showName, setShowName] = useState(false);
  const [visible, setVisible] = useState(STEP);
  const sentinel = useRef<HTMLDivElement>(null);
  const { cols: colCount, ready: columnsReady, setNode: setGridRef } = useColumnCount();

  // ── 온보딩 상태머신 ──────────────────────────────────────────
  // idle → (그리드 준비 후) enter → 4초 강제 → ready → (클릭/X) leaving → done
  // 두 가지 트리거가 같은 머신·오버레이를 공유:
  //  · 광고 유입(spotlightId) — 지정 사진을 제자리 강조 + 배경 카드 흩어짐
  //  · 일반 첫 방문(generalOnboard) — 탐색 메인이면 좌상단 첫 사진을 강조,
  //    slug 페이지면 강조 없이 배경 전체를 어둡게+뿌옇게
  const OB_FORCED_MS = 4000;
  const [obPhase, setObPhase] = useState<"idle" | "enter" | "ready" | "leaving" | "done">(
    spotlightId ? "idle" : "done"
  );

  // 일반 유저 첫 방문 튜토리얼 — 클라이언트에서만 판정(localStorage 필요).
  // 비로그인 + 미열람 + 검색/광고 모드 아님일 때만 1회 노출.
  const [generalOnboard, setGeneralOnboard] = useState(false);
  useEffect(() => {
    if (spotlightId || loggedIn || query) return;
    try {
      if (localStorage.getItem(TUTORIAL_SEEN_KEY) === "1") return;
    } catch {
      return; // 스토리지 접근 불가(사생활 모드 등) → 튜토리얼 생략
    }
    setGeneralOnboard(true);
  }, [spotlightId, loggedIn, query]);

  // 뷰포트가 데스크탑(넓은 화면)인지 — 데스크탑은 좌상단 첫 사진 스포트라이트가
  // 구석의 작은 카드로 어색해, 강조 없이 가운데 인트로로 전환.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const obTriggered = !!spotlightId || generalOnboard;
  const obActive = obTriggered && obPhase !== "done";
  const obShown = obPhase === "enter" || obPhase === "ready"; // 오버레이 보이는 상태

  // 강조(스포트라이트)할 사진 id — 광고는 지정 사진, 일반은 좌상단 첫 카드(메인 + 모바일에서만).
  // undefined 면 강조 카드 없이 배경 전체만 어둡게(slug 일반 모드 / 데스크탑 일반 모드).
  const spotlightTargetId =
    spotlightId ??
    (generalOnboard && spotlightFirstOnGeneral && !isDesktop ? photos[0]?.id : undefined);

  // 광고 모드 hero 사진 프리로드 — 로딩 완료 후 애니메이션 시작.
  // 일반 모드는 프리로드할 hero 가 없어 초기값부터 준비 완료로 둠.
  const [heroReady, setHeroReady] = useState(!spotlightId);
  useEffect(() => {
    if (!spotlightId) return;
    const hero = photos.find((p) => p.id === spotlightId);
    const src = hero?.src_url || hero?.thumb_url || "";
    let settled = false;
    const mark = () => {
      if (!settled) {
        settled = true;
        setHeroReady(true);
      }
    };
    const img = new window.Image();
    img.onload = mark;
    img.onerror = mark;
    img.src = src;
    if (img.complete) mark(); // 캐시된 경우 즉시
    const fallback = setTimeout(mark, 3000); // 안전망(너무 느린 이미지)
    return () => clearTimeout(fallback);
  }, [spotlightId, photos]);

  const obStarted = useRef(false);

  // 일반 모드 트리거가 잡히면 idle 진입 — 아직 시작 전일 때만(닫은 뒤 재진입 방지).
  useEffect(() => {
    if (generalOnboard && !obStarted.current && obPhase === "done") {
      setObPhase("idle");
    }
  }, [generalOnboard, obPhase]);

  // 레이아웃 준비 + (광고 모드면) 사진 로딩 후 한 번만 시작 — 한 박자 보여준 뒤
  // enter → 4초 강제 → ready. obPhase 는 deps 에서 제외(타이머 보존).
  useEffect(() => {
    if (obStarted.current || !obTriggered || !columnsReady || !heroReady) return;
    obStarted.current = true;
    const enterT = setTimeout(() => setObPhase("enter"), 350); // 로딩된 화면을 잠깐 보여줌
    const readyT = setTimeout(() => setObPhase("ready"), 350 + OB_FORCED_MS + 60);
    return () => {
      clearTimeout(enterT);
      clearTimeout(readyT);
    };
  }, [obTriggered, columnsReady, heroReady]);

  // 온보딩 중 스크롤 잠금 — 활성화되면 잠그고, 종료(또는 언마운트) 시 자동 복구.
  // 실제 스크롤 루트는 <html>(layout 의 h-full) 이라 documentElement 까지 잠가야 먹힘.
  useEffect(() => {
    if (!obActive) return;
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
  }, [obActive]);

  function dismissOnboard() {
    if (obPhase !== "ready") return; // 4초 전엔 강제(닫기 불가)
    try {
      localStorage.setItem(TUTORIAL_SEEN_KEY, "1"); // 다시 보지 않음
    } catch {
      /* 스토리지 불가 시 무시 */
    }
    setObPhase("leaving");
    setTimeout(() => setObPhase("done"), 1100); // 카드 복귀·오버레이 페이드 완료까지
  }

  // 풀(검색어/네비게이션) 바뀌면 노출 수 초기화
  useEffect(() => setVisible(STEP), [photos, query]);

  // 바닥 근처에서 더 노출 — 메모리에서 즉시(네트워크 없음).
  // IntersectionObserver(주) + 스크롤/리사이즈(폴백). 관찰자 콜백이 한 번씩 누락돼도
  // 폴백이 바닥 근처를 감지해 이어서 노출 → "스크롤해도 안 뜨는" 멈춤 방지.
  useEffect(() => {
    if (visible >= photos.length) return;
    const el = sentinel.current;
    if (!el) return;

    let done = false; // 이 사이클(visible 값)당 1회만 증가 — 폭주/중복 방지
    const bump = () => {
      if (done) return;
      done = true;
      setVisible((v) => Math.min(photos.length, v + STEP));
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) bump();
      },
      { rootMargin: "1200px" }
    );
    io.observe(el);

    // 폴백: 센티넬이 뷰포트 바닥 1200px 이내로 들어오면 직접 노출
    const check = () => {
      const top = el.getBoundingClientRect().top;
      if (top - window.innerHeight < 1200) bump();
    };
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    // 초기 1회 — 첫 화면이 충분히 길지 않아 관찰자 초기 콜백이 애매할 때 대비
    check();

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [visible, photos.length]);

  // 보기 옵션(가격·작가명) — 세션 유지 + SearchOptions 토글과 이벤트로 동기화
  useEffect(() => {
    setShowPrice(sessionStorage.getItem("explore:showPrice") === "1");
    setShowName(sessionStorage.getItem("explore:showName") === "1");
    function onPrice(e: Event) {
      setShowPrice((e as CustomEvent).detail as boolean);
    }
    function onName(e: Event) {
      setShowName((e as CustomEvent).detail as boolean);
    }
    window.addEventListener("samae:price-toggle", onPrice);
    window.addEventListener("samae:name-toggle", onName);
    return () => {
      window.removeEventListener("samae:price-toggle", onPrice);
      window.removeEventListener("samae:name-toggle", onName);
    };
  }, []);

  const columns = useMemo(
    () => buildColumns(photos.slice(0, visible), colCount),
    [photos, visible, colCount]
  );

  // 온보딩 흩어짐 stagger 용 — 사진 id → 노출 순서 인덱스
  const orderIndex = useMemo(() => {
    const m = new Map<string, number>();
    photos.slice(0, visible).forEach((p, i) => m.set(p.id, i));
    return m;
  }, [photos, visible]);

  // 테두리 — 컬럼별로 어긋나게 배치(한쪽 쏠림 방지) + 가끔 검정
  const accentMap = useMemo(() => assignColumnAccents(columns), [columns]);

  if (photos.length === 0) {
    return (
      <EmptyState
        icon={<SearchIcon className="h-6 w-6" />}
        title={query ? `“${query}” 결과가 없어요` : "공개된 사진이 아직 없어요"}
        description={
          query
            ? "다른 태그나 장소로 검색해보세요. (예: 서울, 감성, 웨딩)"
            : "작가들이 작품을 올리면 여기에 표시돼요."
        }
        action={
          query ? (
            <Link
              href="/"
              className="rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg hover:bg-fg/90"
            >
              전체 둘러보기
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      {/* 메이슨리 갤러리 — JS 컬럼 버킷(추가 시 기존 사진 위치 고정) */}
      <div
        ref={setGridRef}
        className={cn(
          "flex gap-3 pt-3 transition-opacity",
          columnsReady ? "opacity-100" : "opacity-0"
        )}
      >
        {columns.map((col, ci) => (
          <div key={ci} className="flex min-w-0 flex-1 flex-col gap-3">
            {col.map((photo) => {
              const card = (
                <PhotoCard
                  photo={photo}
                  showPrice={showPrice}
                  showName={showName}
                  accent={accentMap.get(photo.id)}
                />
              );
              // 스포트라이트 카드 — 오버레이(z-100) 위로 띄워 제자리 그대로 밝게
              if (spotlightTargetId && photo.id === spotlightTargetId) {
                return (
                  <div
                    key={photo.id}
                    className={cn(
                      "transition-all duration-700",
                      obActive && "relative z-[110]",
                      // 세로 긴 사진/작은 화면에서 카드가 하단 문구를 덮지 않게 높이 캡(모바일만).
                      obShown && "max-h-[44svh] overflow-hidden rounded-2xl ring-2 ring-white/70 ring-offset-2 ring-offset-black md:max-h-none"
                    )}
                  >
                    {card}
                  </div>
                );
              }
              // 나머지 카드 — 강조 사진이 있을 때만 사방으로 휘리릭 흩어짐(닫을 땐 제자리로 복귀).
              // 강조 사진이 없는 일반 모드(slug)는 흩어지지 않고 오버레이로만 어둡게+뿌옇게 덮음.
              if (spotlightTargetId && obActive) {
                const i = orderIndex.get(photo.id) ?? 0;
                return (
                  <div
                    key={photo.id}
                    style={{
                      transform: obShown ? scatterTransform(i) : "none",
                      opacity: obShown ? 0 : 1,
                      transition: `transform 780ms cubic-bezier(.45,0,.15,1) ${scatterDelay(i)}ms, opacity 780ms ease ${scatterDelay(i)}ms`,
                      willChange: "transform, opacity",
                    }}
                  >
                    {card}
                  </div>
                );
              }
              return <div key={photo.id}>{card}</div>;
            })}
          </div>
        ))}
      </div>

      {/* 점진 노출 센티넬 */}
      {visible < photos.length && <div ref={sentinel} className="h-1" />}

      {/* ── 온보딩 스포트라이트 오버레이 ── */}
      {obActive && (
        <>
          {/* 어둡게 + 뿌옇게 덮는 레이어 — 카드가 흩어지는 동안 서서히 어두워짐 */}
          <div
            className={cn(
              "fixed inset-0 z-[100] bg-black/75 backdrop-blur-md transition-opacity duration-[1100ms] ease-out",
              obShown ? "opacity-100" : "opacity-0"
            )}
          />

          {/* 상단 진행 바 (4초) */}
          <div className="fixed inset-x-0 top-0 z-[105] h-[3px] bg-white/10">
            <div
              className="h-full bg-white/80"
              style={{
                width: obShown ? "100%" : "0%",
                transition: obShown ? `width ${OB_FORCED_MS}ms linear` : "none",
              }}
            />
          </div>

          {/* 핵심 문구 — 모바일은 하단 에디토리얼, 데스크탑은 화면 가운데 인트로. 라인 마스크 reveal + 스태거 */}
          <div className="pointer-events-none fixed inset-0 z-[105] flex flex-col justify-end px-7 pb-24 sm:pb-28 md:justify-center md:pb-0">
            <div className="mx-auto w-full max-w-md md:text-center">
              {/* 액센트 라인 — 폭이 그어지듯 (데스크탑은 가운데 정렬) */}
              <span
                aria-hidden
                className="mt-3 block h-px bg-white/30 transition-all duration-[900ms] ease-[cubic-bezier(.16,1,.3,1)] md:mx-auto"
                style={{ width: obShown ? "2.75rem" : "0px", transitionDelay: "140ms" }}
              />

              {/* 헤드라인 — 라인이 아래에서 솟아오름(마스크) */}
              <h2 className="mt-4 text-[1.6rem] font-semibold leading-[1.18] tracking-tight text-white sm:text-[2.05rem]">
                {[
                  { key: "l1", node: "마음에 든 이 느낌 그대로," },
                  // 핵심 단어 '작가'를 로고 컬러로 강조 (튜토리얼 목적: 작가 인식)
                  {
                    key: "l2",
                    node: (
                      <>
                        그 <span className="text-brand">작가</span>가 당신을 담아요.
                      </>
                    ),
                  },
                ].map((line, i) => (
                  <span key={line.key} className="block overflow-hidden pb-[2px]">
                    <span
                      style={{ transitionDelay: obShown ? `${230 + i * 110}ms` : "0ms" }}
                      className={cn(
                        "block transition-all duration-[800ms] ease-[cubic-bezier(.16,1,.3,1)]",
                        obShown ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
                      )}
                    >
                      {line.node}
                    </span>
                  </span>
                ))}
              </h2>

              {/* 서브카피 */}
              <p
                style={{ transitionDelay: obShown ? "480ms" : "0ms" }}
                className={cn(
                  "mt-4 text-[0.95rem] leading-relaxed transition-all duration-700 ease-[cubic-bezier(.16,1,.3,1)]",
                  obShown ? "translate-y-0 text-white/72 opacity-100" : "translate-y-3 opacity-0"
                )}
              >
                지금 보는 사진을 찍은 바로 그 작가와
                <br />같은 무드로 촬영을 진행해보세요.
              </p>
            </div>
          </div>

          {/* 닫기 안내 — 화면 최하단 중앙 */}
          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[105] flex justify-center">
            <span
              className={cn(
                "text-xs transition-opacity duration-500",
                obPhase === "ready" ? "text-white/55 opacity-100" : "text-white/30 opacity-100"
              )}
            >
              {obPhase === "ready" ? "화면을 눌러 시작" : "잠시만요…"}
            </span>
          </div>

          {/* 전체 클릭 캐처 — 4초 전엔 강제(클릭 무시), 이후 어디를 눌러도 닫힘.
              카드 위(z-115)라 온보딩 중 카드 탭 이동·드래그·스크롤도 전부 막힘. */}
          <div
            className="fixed inset-0 z-[115] touch-none select-none overscroll-none"
            onClick={dismissOnboard}
            onTouchMove={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
            aria-hidden
          />

          {/* 닫기 X — 4초 후 표시 */}
          <button
            type="button"
            onClick={dismissOnboard}
            aria-label="닫고 시작하기"
            tabIndex={obPhase === "ready" ? 0 : -1}
            className={cn(
              "fixed right-4 top-4 z-[116] grid h-10 w-10 place-items-center rounded-full bg-white/12 text-white backdrop-blur transition-all duration-300 hover:bg-white/25",
              obPhase === "ready" ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </>
      )}
    </>
  );
}

// 핀터레스트식 핀 카드 — 비율 예약(레이아웃 점프 방지) + 담기('+') + 옵션 표시(가격)
// 브랜드 테두리(accent)는 노출 순서 기준 일정 간격으로만 부여 → 연속으로 몰리지 않음(상위에서 계산)
function PhotoCard({
  photo,
  showPrice,
  showName,
  accent,
}: {
  photo: GalleryPhoto;
  showPrice: boolean;
  showName: boolean;
  accent?: AccentColor;
}) {
  const tags = (photo.mood_tags ?? []).slice(0, 3).join(", ");
  const alt = tags ? `사진 · ${tags}` : "사진";
  // DB 비율로 공간 예약 → 이미지 로드 시 레이아웃 점프 제거
  const ratio =
    photo.width > 0 && photo.height > 0 ? `${photo.width} / ${photo.height}` : undefined;

  return (
    <div
      data-cart-card
      className={cn(
        // 모든 사진에 동일 테두리 — 기본은 배경색(보이지 않음), 저빈도만 브랜드/검정
        "group relative break-inside-avoid overflow-hidden rounded-2xl bg-fg/[0.05] ring-4",
        accent === "brand" ? "ring-brand" : accent === "ink" ? "ring-fg" : "ring-bg"
      )}
    >
      <Link href={`/photos/${photo.id}`} className="block" data-track="cta:photo">
        <img
          src={photo.thumb_url ?? photo.src_url}
          alt={alt}
          loading="lazy"
          style={ratio ? { aspectRatio: ratio } : undefined}
          className="w-full object-cover"
        />
      </Link>

      {/* 가격 표시 (토글 ON + 가격 설정된 사진만) */}
      {showPrice && photo.price_krw != null && (
        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-fg/85 px-2 py-0.5 text-xs font-semibold text-bg">
          ₩{fmt.format(photo.price_krw)}
        </span>
      )}

      {/* 장바구니 담기 ('+') — 작가명/좋아요 대신 담기로 일원화 */}
      <AddToCartButton
        item={{
          id: photo.id,
          src: photo.thumb_url ?? photo.src_url,
          w: photo.width,
          h: photo.height,
        }}
        className="absolute right-2 top-2"
      />
    </div>
  );
}

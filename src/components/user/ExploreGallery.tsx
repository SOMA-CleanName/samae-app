"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { GalleryPhoto } from "@/lib/discovery";
import { cn } from "@/lib/cn";
import { assignColumnAccents, type AccentColor } from "@/lib/seeded-shuffle";
import { SearchIcon } from "@/components/user/icons";
import { AddToCartButton } from "@/components/user/cart/AddToCartButton";
import { useCart } from "@/components/user/cart/CartProvider";
import { mpTrack } from "@/lib/mixpanel";
import { EmptyState } from "@/components/ui";
import { rememberPhotoAspect } from "@/lib/photo-aspect";

const fmt = new Intl.NumberFormat("ko-KR");
const STEP = 48; // 스크롤마다 더 보여줄 사진 수(메모리에서 즉시 노출)
const TUTORIAL_SEEN_KEY = "samae:tutorial-seen"; // 일반 유저 첫 방문 튜토리얼 열람 여부
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type FeedSession = {
  seed?: string;
  items: GalleryPhoto[];
  page: number;
  visible: number;
  exhausted: boolean;
};

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


// 탐색 갤러리 — 서버가 셔플된 풀을 내려주고, 클라이언트는 메모리에서 점진 노출(네트워크 없음).
// JS 컬럼 버킷으로 기존 사진은 절대 재배치되지 않음.
export function ExploreGallery({
  photos: initialPhotos,
  query,
  likedIds = [],
  spotlightId,
  loggedIn = false,
  spotlightFirstOnGeneral = false,
  feedSeed,
  loadMore,
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
  // 시드 기반 무한 스크롤(전체 피드 전용) — 둘 다 있으면 바닥에서 서버 페이지를 이어받음.
  feedSeed?: string;
  loadMore?: (seed: string, page: number) => Promise<GalleryPhoto[]>;
}) {
  const pathname = usePathname();
  const feedSessionKey = `samae:gallery-session:v2:${pathname}${query ? `?q=${query}` : ""}`;
  // 서버가 준 첫 페이지에서 시작해, 무한 스크롤로 다음 페이지를 이어붙인다(누적).
  const [items, setItems] = useState(initialPhotos);
  const feedPage = useRef(0); // 마지막으로 받은 서버 페이지(0=초기)
  const feedExhausted = useRef(false);
  const feedLoading = useRef(false);
  const [activeFeedSeed, setActiveFeedSeed] = useState(feedSeed);
  const [feedSessionReady, setFeedSessionReady] = useState(false);
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
  const OB_FORCED_MS = 2000; // 약 2초 — 이 시간 뒤 스킵(닫기) 가능
  const OB_AUTO_AFTER_READY_MS = 2100; // ready(약 2.4초) 후 → 약 4.5초에 자동 종료(읽을 시간 확보)
  const { add } = useCart(); // 온보딩 종료 시 강조 사진을 담기(관심사진)에 추가
  const [obPhase, setObPhase] = useState<"idle" | "enter" | "ready" | "adding" | "leaving" | "done">(
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

  // 온보딩은 유저당 1회 — 한 번 보면(TUTORIAL_SEEN_KEY) 광고/카테고리 대표 강조 유입이어도 다시 안 뜬다.
  // (localStorage 는 클라이언트에서만 읽히므로 마운트 후 판정)
  const [tutorialSeen, setTutorialSeen] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(TUTORIAL_SEEN_KEY) === "1") setTutorialSeen(true);
    } catch {
      /* 스토리지 접근 불가 → 노출 허용 */
    }
  }, []);
  // 이미 본 유저면 스포트라이트(광고/대표) 온보딩도 시작 전에 즉시 종료 상태로 내린다.
  useEffect(() => {
    if (tutorialSeen && spotlightId) setObPhase("done");
  }, [tutorialSeen, spotlightId]);

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
  const obShown = obPhase === "enter" || obPhase === "ready" || obPhase === "adding"; // 오버레이 보이는 상태(담기 연출 포함)

  // 강조(스포트라이트)할 사진 id — 광고는 지정 사진, 일반은 좌상단 첫 카드(메인 + 모바일에서만).
  // undefined 면 강조 카드 없이 배경 전체만 어둡게(slug 일반 모드 / 데스크탑 일반 모드).
  const spotlightTargetId =
    spotlightId ??
    (generalOnboard && spotlightFirstOnGeneral && !isDesktop ? items[0]?.id : undefined);

  // 광고 모드 hero 사진 프리로드 — 로딩 완료 후 애니메이션 시작.
  // 일반 모드는 프리로드할 hero 가 없어 초기값부터 준비 완료로 둠.
  const [heroReady, setHeroReady] = useState(!spotlightId);
  useEffect(() => {
    if (!spotlightId) return;
    const hero = items.find((p) => p.id === spotlightId);
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
  }, [spotlightId, items]);

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
    if (obStarted.current || !obTriggered || tutorialSeen || !columnsReady || !heroReady) return;
    obStarted.current = true;
    const enterT = setTimeout(() => setObPhase("enter"), 350); // 로딩된 화면을 잠깐 보여줌
    const readyT = setTimeout(() => setObPhase("ready"), 350 + OB_FORCED_MS + 60);
    return () => {
      clearTimeout(enterT);
      clearTimeout(readyT);
    };
  }, [obTriggered, tutorialSeen, columnsReady, heroReady]);

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
    if (obPhase !== "ready") return; // 2초 전엔 강제(닫기 불가)
    try {
      localStorage.setItem(TUTORIAL_SEEN_KEY, "1"); // 다시 보지 않음
    } catch {
      /* 스토리지 불가 시 무시 */
    }
    // ① 어두운 배경(딤은 카트 아래로 낮아짐)은 그대로 둔 채 '원래 담기' 연출 실행 —
    //    강조 사진 카드의 <img> 를 소스로 넘겨 폴라로이드가 도크로 날아가는 기존 애니메이션 재생.
    setObPhase("adding");
    if (spotlightTargetId) {
      const hero = items.find((p) => p.id === spotlightTargetId);
      if (hero) {
        const cardEl = document.querySelector(`[data-cart-card][data-pid="${hero.id}"]`);
        const img = (cardEl?.querySelector("img") as HTMLElement | null) ?? null;
        mpTrack("Add to Cart", { photo_id: hero.id, source: "onboarding" });
        add({ id: hero.id, src: hero.thumb_url ?? hero.src_url, w: hero.width, h: hero.height }, img);
      }
    }
    // ② 담기(폴라로이드 fly ~0.56초) 후 오버레이 걷고 원래 탐색으로 복귀
    setTimeout(() => setObPhase("leaving"), 720);
    setTimeout(() => setObPhase("done"), 720 + 520);
  }

  // ready(약 2초) 후 0.6초 뒤 자동 종료 — 사용자가 직접 안 닫아도 약 3초면 내려간다.
  useEffect(() => {
    if (obPhase !== "ready") return;
    const t = setTimeout(() => dismissOnboard(), OB_AUTO_AFTER_READY_MS);
    return () => clearTimeout(t);
    // dismissOnboard 는 obPhase==="ready" 렌더의 클로저로 호출돼 스테일 아님(deps 에 넣으면 타이머가 매 렌더 리셋)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obPhase]);

  // 홈 피드는 상세 화면을 다녀와도 같은 순서·로드 페이지·노출 수를 복원한다.
  // 서버가 재방문 때 새 seed를 내려줘도 세션의 seed를 계속 사용해야 다음 페이지가 이어진다.
  useEffect(() => {
    try {
        const raw = sessionStorage.getItem(feedSessionKey);
        const cached = raw ? (JSON.parse(raw) as FeedSession) : null;
        if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
          setItems(cached.items);
          setVisible(Math.max(STEP, Math.min(cached.visible, cached.items.length)));
          feedPage.current = Math.max(0, cached.page || 0);
          feedExhausted.current = !!cached.exhausted;
          feedLoading.current = false;
          setActiveFeedSeed(cached.seed ?? feedSeed);
          setFeedSessionReady(true);
          return;
        }
      } catch {
        sessionStorage.removeItem(feedSessionKey);
    }

    setItems(initialPhotos);
    setVisible(STEP);
    feedPage.current = 0;
    feedExhausted.current = false;
    feedLoading.current = false;
    setActiveFeedSeed(feedSeed);
    setFeedSessionReady(true);
  }, [initialPhotos, query, feedSeed, feedSessionKey]);

  useEffect(() => {
    if (!feedSessionReady) return;
    const snapshot: FeedSession = {
      seed: activeFeedSeed,
      items,
      page: feedPage.current,
      visible,
      exhausted: feedExhausted.current,
    };
    try {
      sessionStorage.setItem(feedSessionKey, JSON.stringify(snapshot));
    } catch {
      // 저장 공간이 부족해도 현재 세션의 무한 스크롤은 계속 동작한다.
    }
  }, [activeFeedSeed, feedSessionKey, feedSessionReady, items, visible]);

  // 바닥 근처에서 더 노출 — 로드된 건 STEP 씩 노출, 끝에 닿으면 서버 다음 페이지를 이어받음(무한).
  // IntersectionObserver(주) + 스크롤/리사이즈(폴백).
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;

    let busy = false; // 이 사이클당 1회만 진행 — 폭주/중복 방지
    const advance = async () => {
      if (busy) return;
      // 1) 이미 로드된 것 중 아직 안 보인 게 있으면 그것부터 노출
      if (visible < items.length) {
        busy = true;
        setVisible((v) => Math.min(items.length, v + STEP));
        return;
      }
      // 2) 노출이 로드된 끝에 도달 → 서버 다음 페이지(전체 피드에서만, 소진 전)
      if (!loadMore || !activeFeedSeed || feedExhausted.current || feedLoading.current) return;
      busy = true;
      feedLoading.current = true;
      try {
        const more = await loadMore(activeFeedSeed, feedPage.current + 1);
        if (!more || more.length === 0) {
          feedExhausted.current = true; // 더 없음 → 종료
        } else {
          feedPage.current += 1;
          setItems((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            return [...prev, ...more.filter((p) => !seen.has(p.id))];
          });
          setVisible((v) => v + STEP);
        }
      } catch {
        feedExhausted.current = true;
      } finally {
        feedLoading.current = false;
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) advance();
      },
      { rootMargin: "1200px" }
    );
    io.observe(el);

    const check = () => {
      const top = el.getBoundingClientRect().top;
      if (top - window.innerHeight < 1200) advance();
    };
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    check();

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [visible, items.length, activeFeedSeed, loadMore]);

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
    () => buildColumns(items.slice(0, visible), colCount),
    [items, visible, colCount]
  );

  // 테두리 — 컬럼별로 어긋나게 배치(한쪽 쏠림 방지) + 가끔 검정
  const SHOW_ACCENTS = false; // 탐색 카드 악센트 테두리 임시 OFF (true 로 복구)
  const accentMap = useMemo(() => assignColumnAccents(columns), [columns]);

  if (items.length === 0) {
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
          "flex gap-2.5 transition-opacity sm:gap-4",
          columnsReady ? "opacity-100" : "opacity-0"
        )}
      >
        {columns.map((col, ci) => (
          <div key={ci} className="flex min-w-0 flex-1 flex-col gap-2.5 sm:gap-4">
            {col.map((photo) => {
              // 온보딩 중 강조(스포트라이트) 카드 — 이 카드에선 담기('+') 버튼을 숨긴다.
              // (온보딩이 끝나면서 자동으로 담기 연출이 실행되므로 버튼 노출이 혼란스러움)
              const isSpotlightCard =
                !!spotlightTargetId && photo.id === spotlightTargetId && obActive;
              const card = (
                <PhotoCard
                  photo={photo}
                  showPrice={showPrice}
                  showName={showName}
                  // 온보딩 디밍 중엔 브랜드 빨간 테두리가 비쳐 어색해 보여 숨김
                  accent={obActive || !SHOW_ACCENTS ? undefined : accentMap.get(photo.id)}
                  hideCart={isSpotlightCard}
                />
              );
              // 스포트라이트 카드 — 오버레이(z-100) 위로 띄워 제자리 그대로 밝게(온보딩 활성 중에만).
              // done 이후엔 일반 카드로 렌더돼 그리드에 그대로 남는다(도크엔 담긴 복제본).
              if (isSpotlightCard) {
                return (
                  <div
                    key={photo.id}
                    className={cn(
                      "transition-all duration-[560ms] ease-[cubic-bezier(.5,0,.2,1)]",
                      // 소개(enter/ready) 중에만 카드를 띄움. 담기(adding)·나가기(leaving) 땐 z 를 낮춰
                      // fly 폴라로이드(도크로 날아가는 z-50)가 카드에 가려지지 않게 한다.
                      (obPhase === "enter" || obPhase === "ready") && "relative z-[110]",
                      // 세로 긴 사진/작은 화면에서 카드가 하단 문구를 덮지 않게 높이 캡(모바일만).
                      obShown && "max-h-[44svh] overflow-hidden rounded-2xl ring-2 ring-white/70 ring-offset-2 ring-offset-black md:max-h-none"
                    )}
                  >
                    {card}
                  </div>
                );
              }
              // 나머지 카드 — 흩어지지 않고 제자리 유지(오버레이의 블러+딤으로만 살짝 가려짐).
              return <div key={photo.id}>{card}</div>;
            })}
          </div>
        ))}
      </div>

      {/* 점진 노출 센티넬 */}
      {(visible < items.length || (!!loadMore && !!activeFeedSeed)) && (
        <div ref={sentinel} className="h-1" />
      )}

      {/* ── 온보딩 스포트라이트 오버레이 ── */}
      {obActive && (
        <>
          {/* 어둡게 + 뿌옇게 덮는 레이어 — 카드가 흩어지는 동안 서서히 어두워짐.
              h-[100lvh]: iOS 하단 툴바가 접혀도 화면 끝까지 덮어 하단 사진이 새지 않게. */}
          <div
            className={cn(
              "fixed inset-x-0 top-0 h-[100lvh] bg-black/[0.6] backdrop-blur-lg transition-opacity ease-out",
              // 담기 연출 중엔 딤을 카트(z-50)보다 아래로 낮춰 폴라로이드 fly·도크가 배경 위로 보이게
              obPhase === "adding" || obPhase === "leaving" ? "z-[45]" : "z-[100]",
              // 탭해서 스킵하면(=adding) 딤·블러를 바로 걷어내 배경이 빠르게 선명해지게 —
              // 폴라로이드는 선명해진 배경 위로 날아간다(블러가 늦게 풀리던 문제 해결).
              obPhase === "adding" || obPhase === "leaving" ? "duration-[300ms]" : "duration-[1100ms]",
              obPhase === "enter" || obPhase === "ready" ? "opacity-100" : "opacity-0"
            )}
          />

          {/* 상단 진행 바 — 자동 종료 시점까지 채워짐 */}
          <div className="fixed inset-x-0 top-0 z-[105] h-[3px] bg-white/10">
            <div
              className="h-full bg-white/80"
              style={{
                width: obShown ? "100%" : "0%",
                transition: obShown ? `width ${OB_FORCED_MS + OB_AUTO_AFTER_READY_MS}ms linear` : "none",
              }}
            />
          </div>

          {/* 하단 스크림 — 작은 화면·긴 사진에서 문구가 밝은 스포트라이트 사진 위로 겹쳐도 읽히게(모바일만). */}
          <div
            aria-hidden
            className={cn(
              "pointer-events-none fixed inset-x-0 bottom-0 z-[114] h-72 bg-gradient-to-t from-black/75 via-black/40 to-transparent transition-opacity duration-500 md:hidden",
              obShown && obPhase !== "adding" ? "opacity-100" : "opacity-0"
            )}
          />

          {/* 핵심 문구 — 모바일은 하단 에디토리얼, 데스크탑은 화면 가운데 인트로. 라인 마스크 reveal + 스태거.
              z-[115]: 스포트라이트 사진(z-110) 위에 올려 작은 화면에서 사진에 가려지지 않게. */}
          <div
            className={cn(
              "pointer-events-none fixed inset-0 z-[115] flex flex-col justify-end px-7 pb-24 transition-opacity duration-300 sm:pb-28 md:justify-center md:pb-0",
              obPhase === "adding" || obPhase === "leaving" ? "opacity-0" : "opacity-100"
            )}
          >
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

          {/* 닫기 안내 — 화면 최하단 중앙 (사진 위 z-115) */}
          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[115] flex justify-center">
            <span
              className={cn(
                "text-xs transition-opacity duration-500",
                obPhase === "ready" ? "text-white/55 opacity-100" : "text-white/30 opacity-100"
              )}
            >
              {obPhase === "ready" ? "탭해서 둘러보기" : "잠시만요…"}
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

          {/* 닫기 X — 스킵 가능(ready) 시 우상단에 노출. 클릭 캐처(z-115)보다 위(z-116). */}
          <button
            type="button"
            onClick={dismissOnboard}
            aria-label="건너뛰기"
            className={cn(
              "fixed right-4 top-4 z-[116] grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-opacity duration-300 hover:bg-white/25",
              obPhase === "ready" ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
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
  hideCart = false,
}: {
  photo: GalleryPhoto;
  showPrice: boolean;
  showName: boolean;
  accent?: AccentColor;
  // 온보딩 강조 카드에선 담기 버튼을 숨김
  hideCart?: boolean;
}) {
  const tags = (photo.mood_tags ?? []).slice(0, 3).join(", ");
  const alt = tags ? `사진 · ${tags}` : "사진";
  const [loaded, setLoaded] = useState(false);
  // DB 비율로 공간 예약 → 이미지 로드 시 레이아웃 점프 제거
  const ratio =
    photo.width > 0 && photo.height > 0 ? `${photo.width} / ${photo.height}` : undefined;

  return (
    <div
      data-cart-card
      data-pid={photo.id}
      className={cn(
        // 저빈도 악센트 테두리 — border(안쪽)라 사진만 살짝 줄고 바깥 크기는 열 폭 그대로
        // (ring 바깥쪽이면 옆으로 삐져나와 더 커 보였음). 기본은 테두리 없음.
        "group relative break-inside-avoid overflow-hidden bg-fg/[0.05]",
        accent === "brand" ? "border-[6px] border-brand" : accent === "ink" ? "border-[6px] border-fg" : ""
      )}
    >
      {/* 로드 전 스켈레톤 — 빠르게 스크롤해도 빈 칸이 '로딩 중'으로 보이게 */}
      {!loaded && <div aria-hidden className="pointer-events-none absolute inset-0 shimmer" />}
      <Link
        href={`/photos/${photo.id}`}
        scroll={false}
        className="block"
        data-track="cta:photo"
        onClick={(event) => {
          rememberPhotoAspect(photo.id, photo.width, photo.height);
          // 좌표만 저장하면 이미지/무한 피드 높이가 복구되기 전에 브라우저가 위로 clamp한다.
          // 클릭한 카드와 당시 화면 내 위치를 함께 저장해 뒤로 왔을 때 같은 자리에 맞춘다.
          try {
            const card = event.currentTarget.closest<HTMLElement>("[data-pid]");
            sessionStorage.setItem(
              `samae:scroll-anchor:${window.location.pathname}`,
              JSON.stringify({ id: photo.id, viewportTop: card?.getBoundingClientRect().top ?? 0 })
            );
            sessionStorage.setItem(
              `samae:scroll:${window.location.pathname}`,
              String(Math.round(window.scrollY))
            );
            sessionStorage.setItem(
              "samae:photo-return",
              JSON.stringify({
                pathname: window.location.pathname,
                y: Math.round(window.scrollY),
                photoId: photo.id,
                viewportTop: card?.getBoundingClientRect().top ?? 0,
              })
            );
          } catch {
            /* 저장소 접근 불가 시 기본 Next 뒤로가기로 동작 */
          }
        }}
      >
        {photo.width > 0 && photo.height > 0 ? (
          // next/image — 표시 폭(모바일 2열 ~45vw)에 맞춰 AVIF/WebP·반응형 srcset 생성.
          // 원본 썸네일(500px)을 그대로 받던 것 대비 모바일 바이트가 크게 줄어든다.
          <Image
            src={photo.thumb_url ?? photo.src_url}
            alt={alt}
            width={photo.width}
            height={photo.height}
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
            style={{ width: "100%", height: "auto", aspectRatio: ratio }}
            className="relative object-cover"
            onLoad={() => setLoaded(true)}
            // 로드 실패해도 스켈레톤 해제 — 무한 shimmer 방지
            onError={() => setLoaded(true)}
          />
        ) : (
          <img
            src={photo.thumb_url ?? photo.src_url}
            alt={alt}
            loading="lazy"
            style={ratio ? { aspectRatio: ratio } : undefined}
            className="relative w-full object-cover"
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
          />
        )}
      </Link>

      {/* 가격 표시 (토글 ON + 가격 설정된 사진만) */}
      {showPrice && photo.price_krw != null && (
        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-fg/85 px-2 py-0.5 text-xs font-semibold text-bg">
          ₩{fmt.format(photo.price_krw)}
        </span>
      )}

      {/* 장바구니 담기 ('+') — 작가명/좋아요 대신 담기로 일원화. 온보딩 강조 카드에선 숨김. */}
      {!hideCart && (
        <AddToCartButton
          item={{
            id: photo.id,
            src: photo.thumb_url ?? photo.src_url,
            w: photo.width,
            h: photo.height,
          }}
          className="absolute right-2 top-2"
        />
      )}
    </div>
  );
}

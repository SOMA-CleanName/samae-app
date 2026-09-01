"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AddToCartButton } from "@/components/user/cart/AddToCartButton";
import { rememberPhotoAspect } from "@/lib/photo-aspect";
import type { GalleryPhoto } from "@/lib/discovery";
import { readFeedClicks, recordFeedClick } from "@/lib/feed-click-history";
import { buildDiverseMasonryColumns } from "@/lib/masonry-columns";

export type ExplorePhoto = {
  id: string;
  src_url: string;
  thumb_url: string | null;
  width: number;
  height: number;
  albumId?: string | null;
};

const STEP = 30; // 스크롤마다 더 보여줄 사진 수(메모리에서 즉시 노출)

// 사진 상세 하단 — 추천 사진만 무한스크롤로 노출.
// (작가 사진 탭은 제거: 작가 식별 노출 금지 + 이탈 유도 방지. 스크롤 내리면 추천만 이어짐)
export function PhotoExplore({
  initialRecs,
  feedSeed,
  loadMore,
  rerank,
  excludeId,
}: {
  initialRecs: ExplorePhoto[];
  // 시드 무한 스크롤(전체 피드) — 큐레이션 추천 뒤에 이어붙임. 둘 다 있으면 무한.
  feedSeed?: string;
  loadMore?: (seed: string, page: number) => Promise<GalleryPhoto[]>;
  rerank?: (clickedPhotoIds: string[]) => Promise<ExplorePhoto[]>;
  excludeId?: string; // 현재 사진 — 이어붙일 때 제외
}) {
  return (
    // 바깥 여백은 호출부(page.tsx 의 추천 섹션)가 준다.
    // 여기와 스켈레톤 중 한쪽만 여백을 들고 있으면 로드가 끝날 때 그리드가 그만큼 튄다.
    <section>
      {/* key=현재 사진 → 다른 사진으로 이동 시 리마운트되어 누적/페이지 상태 초기화 */}
      <RecsFeed
        key={excludeId ?? "recs"}
        initial={initialRecs}
        feedSeed={feedSeed}
        loadMore={loadMore}
        rerank={rerank}
        excludeId={excludeId}
      />
    </section>
  );
}

// 추천 피드 — page0 은 서버 유사도순 큐레이션(initial), 그 끝에 닿으면 시드 피드를 이어붙여 무한 노출.
function RecsFeed({
  initial,
  feedSeed,
  loadMore,
  rerank,
  excludeId,
}: {
  initial: ExplorePhoto[];
  feedSeed?: string;
  loadMore?: (seed: string, page: number) => Promise<GalleryPhoto[]>;
  rerank?: (clickedPhotoIds: string[]) => Promise<ExplorePhoto[]>;
  excludeId?: string;
}) {
  const [items, setItems] = useState(initial);
  const [visible, setVisible] = useState(STEP);
  const sentinel = useRef<HTMLDivElement>(null);
  const feedPage = useRef(0);
  const feedExhausted = useRef(false);
  const feedLoading = useRef(false);

  // 개인화 추천은 시드 유사 추천 **뒤에** 이어붙인다.
  //
  // 앞에 붙이면 첫 화면(STEP=30장)이 전부 개인화로 채워져 시드 기준 추천은
  // 120장 뒤로 밀려 사실상 도달하지 못한다. 그러면 "이런 사진은 어때요?" 가
  // 지금 보는 사진과 무관한 목록이 되고, 클릭 이력이 그대로면 **어떤 사진을
  // 열어도 같은 추천**이 나온다.
  //
  // 순서를 뒤집어 첫 화면은 시드 유사도가 지키고, 스크롤을 내리면 개인화가
  // 이어지게 한다(docs/24 개인화 의도는 그대로 유지).
  useEffect(() => {
    const clicks = readFeedClicks();
    if (!rerank || clicks.length === 0) return;
    let active = true;
    rerank(clicks).then((ranked) => {
      if (!active || ranked.length === 0) return;
      const seen = new Set<string>();
      setItems([...initial, ...ranked].filter((photo) => {
        if (photo.id === excludeId || seen.has(photo.id)) return false;
        seen.add(photo.id);
        return true;
      }));
      // 첫 화면은 이미 시드 추천으로 채워져 있으므로 노출 개수를 되돌리지 않는다.
      // setVisible(STEP) 을 부르면 스크롤해 둔 사용자의 위치가 위로 튕긴다.
    }).catch(() => undefined);
    return () => { active = false; };
  }, [excludeId, initial, rerank]);

  // 바닥 근처 → 로드된 것부터 노출, 끝에 닿으면 시드 피드 다음 페이지를 이어붙임(중복·현재 사진 제외).
  // (다른 사진으로 이동하면 key 로 리마운트되어 상태가 초기화됨 — 별도 리셋 effect 불필요)
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    let busy = false;
    const advance = async () => {
      if (busy) return;
      if (visible < items.length) {
        busy = true;
        setVisible((v) => Math.min(items.length, v + STEP));
        return;
      }
      if (!loadMore || !feedSeed || feedExhausted.current || feedLoading.current) return;
      busy = true;
      feedLoading.current = true;
      try {
        // 새 사진이 나올 때까지 다음 페이지 진행(이미 추천에 있던 것/현재 사진은 건너뜀)
        while (!feedExhausted.current) {
          const more = await loadMore(feedSeed, feedPage.current + 1);
          if (!more || more.length === 0) {
            feedExhausted.current = true;
            break;
          }
          feedPage.current += 1;
          const seen = new Set(items.map((p) => p.id));
          if (excludeId) seen.add(excludeId);
          const fresh = more
            .filter((p) => !seen.has(p.id))
            .map((p) => ({
              id: p.id,
              src_url: p.src_url,
              thumb_url: p.thumb_url,
              width: p.width,
              height: p.height,
              albumId: p.album_id,
            }));
          if (fresh.length) {
            setItems((prev) => [...prev, ...fresh]);
            setVisible((v) => v + STEP);
            break;
          }
          // 전부 중복 → 다음 페이지 계속
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
  }, [visible, items, feedSeed, loadMore, excludeId]);

  return (
    <>
      <PhotoMasonry photos={items.slice(0, visible)} empty="추천할 사진이 아직 없어요." altLabel="추천 사진" />
      {(visible < items.length || (!!loadMore && !!feedSeed)) && <div ref={sentinel} className="h-1" />}
    </>
  );
}

// 컨테이너 폭 기준 반응형 컬럼 수 (좁은 우측 컬럼/전체폭 어디서나 카드 폭 ~180px 유지)
function useColumnCount(ref: React.RefObject<HTMLDivElement | null>) {
  const [cols, setCols] = useState(2);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      setCols(Math.max(2, Math.min(6, Math.round(w / 180))));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return cols;
}

// 관련도 순서를 유지하면서 같은 앨범이 같은 화면 높이에 겹치지 않도록 분배한다.
// 이 배치도 앞에서부터 결정되므로 뒤에 사진이 추가되어도 기존 사진의 컬럼은 바뀌지 않는다.
function buildColumns(photos: ExplorePhoto[], colCount: number): ExplorePhoto[][] {
  return buildDiverseMasonryColumns(photos, colCount).map((column) =>
    column.map((item) => item.photo)
  );
}

// 추천 타일 이미지 — 로드 전 스켈레톤(빠른 스크롤 시 빈 칸이 '로딩 중'으로 보이게).
function RecTileImage({
  p,
  alt,
  ratio,
}: {
  p: ExplorePhoto;
  alt: string;
  ratio: string | undefined;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && (
        <span aria-hidden className="pointer-events-none absolute inset-0 shimmer" />
      )}
      {p.width > 0 && p.height > 0 ? (
        <Image
          src={p.thumb_url ?? p.src_url}
          alt={alt}
          width={p.width}
          height={p.height}
          sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
          style={{ width: "100%", height: "auto", aspectRatio: ratio }}
          className="relative object-cover"
          onLoad={() => setLoaded(true)}
          // 로드 실패해도 스켈레톤 해제 — 무한 shimmer 방지
          onError={() => setLoaded(true)}
        />
      ) : (
        <img
          src={p.thumb_url ?? p.src_url}
          alt={alt}
          loading="lazy"
          style={ratio ? { aspectRatio: ratio } : undefined}
          className="relative w-full object-cover"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      )}
    </>
  );
}

// 메이슨리 사진 그리드 — 클릭 시 해당 사진 상세로.
// JS 컬럼 버킷(높이 균형) — 점진 노출 시 기존 사진이 재배치되지 않음.
function PhotoMasonry({
  photos,
  empty,
  altLabel,
}: {
  photos: ExplorePhoto[];
  empty: string;
  altLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const colCount = useColumnCount(ref);
  const columns = useMemo(() => buildColumns(photos, colCount), [photos, colCount]);

  /*
    카드 등장 — 홈 피드와 같은 관찰자다(globals.css 의 .feed-rise).

    ⚠️ 숨김은 관찰자가 실제로 설치된 뒤에만 걸린다(부모의 data-reveal-on).
       기본값을 숨김으로 두면 관찰자가 안 도는 경우 — 백그라운드 탭, 하이드레이션 실패,
       IntersectionObserver 미지원 — 추천이 통째로 사라진다.
    한 번 보이면 관찰을 끊는다. 무한 스크롤이라 카드가 수백 장까지 늘어난다.
  */
  useLayoutEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const grid = ref.current;
    if (!grid) return;
    grid.dataset.revealOn = "1";

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.shown = "1";
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.01 }
    );
    grid.querySelectorAll<HTMLElement>(".feed-rise:not([data-shown])").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [colCount, photos.length]);

  if (photos.length === 0) {
    return <p className="mt-10 text-center text-sm text-muted">{empty}</p>;
  }
  return (
    <div ref={ref} data-recs-grid className="mt-5 flex gap-3">
      {columns.map((col, ci) => (
        <div key={ci} className="flex min-w-0 flex-1 flex-col gap-3">
          {col.map((p) => {
            const ratio = p.width > 0 && p.height > 0 ? `${p.width} / ${p.height}` : undefined;
            return (
              <div
                key={p.id}
                data-cart-card
                data-pid={p.id}
                // 홈 피드와 같은 장치. 화면에 들어올 때 떠오른다.
                // (열마다 --c 로 조금씩 늦춰 같은 줄이 통째로 튀지 않게)
                className="feed-rise group relative overflow-hidden"
                style={{ ["--c" as string]: ci }}
              >
                <Link
                  href={`/photos/${p.id}`}
                  scroll={false}
                  className="block transition-opacity hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  onClick={(event) => {
                    recordFeedClick(p.id);
                    rememberPhotoAspect(p.id, p.width, p.height);
                    try {
                      const card = event.currentTarget.closest<HTMLElement>("[data-pid]");
                      sessionStorage.setItem(
                        `samae:detail-return:${window.location.pathname}`,
                        JSON.stringify({
                          pathname: window.location.pathname,
                          y: Math.round(window.scrollY),
                          photoId: p.id,
                          viewportTop: card?.getBoundingClientRect().top ?? 0,
                        })
                      );
                    } catch {
                      /* 저장소 접근 불가 시 기본 뒤로가기로 동작 */
                    }
                  }}
                >
                  <RecTileImage p={p} alt={altLabel} ratio={ratio} />
                </Link>
                {/* 상세 하단 추천에서도 담기 가능 */}
                <AddToCartButton
                  item={{ id: p.id, src: p.thumb_url ?? p.src_url, w: p.width, h: p.height }}
                  className="absolute right-2 top-2"
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

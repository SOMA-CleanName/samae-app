"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AddToCartButton } from "@/components/user/cart/AddToCartButton";
import { rememberPhotoAspect } from "@/lib/photo-aspect";
import type { GalleryPhoto } from "@/lib/discovery";

export type ExplorePhoto = {
  id: string;
  src_url: string;
  thumb_url: string | null;
  width: number;
  height: number;
};

const STEP = 30; // 스크롤마다 더 보여줄 사진 수(메모리에서 즉시 노출)

// 사진 상세 하단 — 추천 사진만 무한스크롤로 노출.
// (작가 사진 탭은 제거: 작가 식별 노출 금지 + 이탈 유도 방지. 스크롤 내리면 추천만 이어짐)
export function PhotoExplore({
  initialRecs,
  feedSeed,
  loadMore,
  excludeId,
}: {
  initialRecs: ExplorePhoto[];
  // 시드 무한 스크롤(전체 피드) — 큐레이션 추천 뒤에 이어붙임. 둘 다 있으면 무한.
  feedSeed?: string;
  loadMore?: (seed: string, page: number) => Promise<GalleryPhoto[]>;
  excludeId?: string; // 현재 사진 — 이어붙일 때 제외
}) {
  return (
    <section className="mt-6">
      {/* key=현재 사진 → 다른 사진으로 이동 시 리마운트되어 누적/페이지 상태 초기화 */}
      <RecsFeed
        key={excludeId ?? "recs"}
        initial={initialRecs}
        feedSeed={feedSeed}
        loadMore={loadMore}
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
  excludeId,
}: {
  initial: ExplorePhoto[];
  feedSeed?: string;
  loadMore?: (seed: string, page: number) => Promise<GalleryPhoto[]>;
  excludeId?: string;
}) {
  const [items, setItems] = useState(initial);
  const [visible, setVisible] = useState(STEP);
  const sentinel = useRef<HTMLDivElement>(null);
  const feedPage = useRef(0);
  const feedExhausted = useRef(false);
  const feedLoading = useRef(false);

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

// 높이 균형 그리디 분배 — 각 사진을 가장 짧은 컬럼에 넣는다.
// 순서가 고정이면 prefix-stable: 뒤에 더 추가돼도 앞 사진들의 컬럼/위치가 안 바뀜(재정렬 없음).
function buildColumns(photos: ExplorePhoto[], colCount: number): ExplorePhoto[][] {
  const cols: ExplorePhoto[][] = Array.from({ length: colCount }, () => []);
  const heights = new Array(colCount).fill(0);
  for (const p of photos) {
    const ratio = p.width > 0 && p.height > 0 ? p.height / p.width : 1;
    let min = 0;
    for (let c = 1; c < colCount; c++) if (heights[c] < heights[min]) min = c;
    cols[min].push(p);
    heights[min] += ratio;
  }
  return cols;
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
  if (photos.length === 0) {
    return <p className="mt-10 text-center text-sm text-muted">{empty}</p>;
  }
  return (
    <div ref={ref} className="mt-5 flex gap-3">
      {columns.map((col, ci) => (
        <div key={ci} className="flex min-w-0 flex-1 flex-col gap-3">
          {col.map((p) => {
            const ratio = p.width > 0 && p.height > 0 ? `${p.width} / ${p.height}` : undefined;
            return (
              <div
                key={p.id}
                data-cart-card
                className="group relative overflow-hidden bg-fg/[0.05]"
              >
                <Link
                  href={`/photos/${p.id}`}
                  className="block transition-opacity hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  onClick={() => rememberPhotoAspect(p.id, p.width, p.height)}
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

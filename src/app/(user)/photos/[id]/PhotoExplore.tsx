"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadExplorePhotos, type ExplorePhoto } from "@/app/(user)/actions";
import { cn } from "@/lib/cn";

// 사진 상세 하단 — '추천' / '작가 사진' 을 탭 클릭으로 좌우 슬라이드 전환.
// 두 패널 모두 마운트 유지(전환 시 재요청·깜빡임 없음). 컨테이너 높이를 활성 패널에 맞춰 스크롤 한계 고정.
export function PhotoExplore({
  photoId,
  initialRecs,
  portfolio,
  photographerName,
}: {
  photoId: string;
  initialRecs: ExplorePhoto[];
  portfolio: ExplorePhoto[];
  photographerName: string;
}) {
  const tabs = ["추천", `${photographerName} 사진`];
  const [idx, setIdx] = useState(0);

  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [height, setHeight] = useState<number | undefined>(undefined);

  // 활성 패널 높이에 컨테이너를 맞춤 → 그 탭의 사진 수만큼만 스크롤 (추천은 무한스크롤로 늘어남 → ResizeObserver)
  useEffect(() => {
    const el = panelRefs.current[idx];
    if (!el) return;
    setHeight(el.offsetHeight);
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [idx]);

  return (
    <section className="mt-12">
      {/* 탭 — 모바일 50/50 균등폭, 데스크톱 좌측 정렬 */}
      <div className="flex border-b border-line">
        {tabs.map((label, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIdx(i)}
            aria-selected={idx === i}
            className={cn(
              "-mb-px flex-1 cursor-pointer border-b-2 px-4 py-2.5 text-sm font-medium transition-colors md:flex-none",
              idx === i ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 슬라이드 페이저 — 탭 클릭으로만 전환 */}
      <div className="overflow-hidden" style={{ height }}>
        <div
          className="flex items-start transition-transform duration-300 ease-out"
          style={{ transform: `translateX(${-idx * 100}%)` }}
        >
          <div
            ref={(el) => {
              panelRefs.current[0] = el;
            }}
            className="w-full shrink-0"
            aria-hidden={idx !== 0}
          >
            <RecsFeed photoId={photoId} initial={initialRecs} active={idx === 0} />
          </div>
          <div
            ref={(el) => {
              panelRefs.current[1] = el;
            }}
            className="w-full shrink-0"
            aria-hidden={idx !== 1}
          >
            <PhotoMasonry
              photos={portfolio}
              empty="아직 공개된 사진이 없어요."
              altLabel={`${photographerName} 작품`}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// 추천 무한 스크롤 — 활성 탭일 때만 다음 배치 로드
function RecsFeed({
  photoId,
  initial,
  active,
}: {
  photoId: string;
  initial: ExplorePhoto[];
  active: boolean;
}) {
  const [photos, setPhotos] = useState<ExplorePhoto[]>(initial);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(initial.length === 0);
  const sentinel = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string>>(new Set(initial.map((p) => p.id)));

  const loadMore = useCallback(async () => {
    if (loading || done || !active) return;
    setLoading(true);
    const next = await loadExplorePhotos(photoId, photos.length);
    if (next.length === 0) {
      setDone(true);
    } else {
      const fresh = next.filter((p) => !seen.current.has(p.id));
      fresh.forEach((p) => seen.current.add(p.id));
      setPhotos((prev) => [...prev, ...fresh]);
    }
    setLoading(false);
  }, [loading, done, active, photoId, photos.length]);

  useEffect(() => {
    if (!active) return; // 활성 탭일 때만 관찰(비활성 패널 백그라운드 로드 방지)
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "600px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, active]);

  return (
    <>
      <PhotoMasonry photos={photos} empty="추천할 사진이 아직 없어요." altLabel="추천 사진" />
      <div ref={sentinel} className="h-1" />
      {loading && <p className="mt-4 text-center text-sm text-muted">불러오는 중…</p>}
      {done && photos.length > 0 && (
        <p className="mt-6 text-center text-sm text-faint">마지막까지 다 봤어요.</p>
      )}
    </>
  );
}

// 메이슨리 사진 그리드 — 클릭 시 해당 사진 상세로
function PhotoMasonry({
  photos,
  empty,
  altLabel,
}: {
  photos: ExplorePhoto[];
  empty: string;
  altLabel: string;
}) {
  if (photos.length === 0) {
    return <p className="mt-10 text-center text-sm text-muted">{empty}</p>;
  }
  return (
    <div className="mt-5 columns-2 gap-3 sm:columns-3 md:columns-4 lg:columns-5 [&>*]:mb-3">
      {photos.map((p) => (
        <Link
          key={p.id}
          href={`/photos/${p.id}`}
          className="block break-inside-avoid overflow-hidden rounded-2xl bg-fg/[0.05] transition-opacity hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <img
            src={p.thumb_url ?? p.src_url}
            alt={altLabel}
            loading="lazy"
            className="w-full object-cover"
          />
        </Link>
      ))}
    </div>
  );
}

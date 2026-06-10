"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadExplorePhotos, type ExplorePhoto } from "@/app/(user)/actions";

type Tab = "recs" | "portfolio";

// 사진 상세 하단 — '추천(무한 스크롤)' / '작가 포트폴리오' 탭
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
  const [tab, setTab] = useState<Tab>("recs");

  return (
    <section className="mt-12">
      {/* 탭 */}
      <div className="flex gap-1 border-b border-fg/10">
        <TabButton active={tab === "recs"} onClick={() => setTab("recs")}>
          추천
        </TabButton>
        <TabButton active={tab === "portfolio"} onClick={() => setTab("portfolio")}>
          {photographerName} 사진
        </TabButton>
      </div>

      {tab === "recs" ? (
        <RecsFeed photoId={photoId} initial={initialRecs} />
      ) : (
        <PhotoMasonry photos={portfolio} empty="아직 공개된 사진이 없어요." />
      )}
    </section>
  );
}

// 추천 무한 스크롤 — 스크롤 끝(sentinel)에 닿으면 다음 배치 로드
function RecsFeed({ photoId, initial }: { photoId: string; initial: ExplorePhoto[] }) {
  const [photos, setPhotos] = useState<ExplorePhoto[]>(initial);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(initial.length === 0);
  const sentinel = useRef<HTMLDivElement>(null);
  // 이미 보여준 id (중복 방지) — 배치 셔플로 인한 겹침 컷
  const seen = useRef<Set<string>>(new Set(initial.map((p) => p.id)));

  const loadMore = useCallback(async () => {
    if (loading || done) return;
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
  }, [loading, done, photoId, photos.length]);

  // sentinel 가시화 감지 → 추가 로드
  useEffect(() => {
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
  }, [loadMore]);

  return (
    <>
      <PhotoMasonry photos={photos} empty="추천할 사진이 아직 없어요." />
      <div ref={sentinel} className="h-1" />
      {loading && <p className="mt-4 text-center text-sm text-fg/40">불러오는 중…</p>}
      {done && photos.length > 0 && (
        <p className="mt-6 text-center text-sm text-fg/35">마지막까지 다 봤어요.</p>
      )}
    </>
  );
}

// 메이슨리 사진 그리드 — 클릭 시 해당 사진 상세로
function PhotoMasonry({ photos, empty }: { photos: ExplorePhoto[]; empty: string }) {
  if (photos.length === 0) {
    return <p className="mt-10 text-center text-sm text-fg/45">{empty}</p>;
  }
  return (
    <div className="mt-5 columns-2 gap-3 sm:columns-3 md:columns-4 lg:columns-5 [&>*]:mb-3">
      {photos.map((p) => (
        <Link
          key={p.id}
          href={`/photos/${p.id}`}
          className="block break-inside-avoid overflow-hidden rounded-xl bg-fg/[0.05]"
        >
          <img
            src={p.thumb_url ?? p.src_url}
            alt=""
            loading="lazy"
            className="w-full object-cover"
          />
        </Link>
      ))}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        active ? "border-fg text-fg" : "border-transparent text-fg/50 hover:text-fg/80"
      }`}
    >
      {children}
    </button>
  );
}

"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export type ExplorePhoto = {
  id: string;
  src_url: string;
  thumb_url: string | null;
  width: number;
  height: number;
};

const STEP = 30; // 스크롤마다 더 보여줄 사진 수(메모리에서 즉시 노출)

// 사진 상세 하단 — '추천' / '작가 사진' 을 탭 클릭으로 좌우 슬라이드 전환.
// 두 패널 모두 마운트 유지(전환 시 재요청·깜빡임 없음). 컨테이너 높이를 활성 패널에 맞춰 스크롤 한계 고정.
export function PhotoExplore({
  initialRecs,
  portfolio,
  photographerName,
}: {
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
            <RecsFeed initial={initialRecs} active={idx === 0} />
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

// 추천 피드 — 서버가 유사도순 풀을 한 번에 주고, 활성 탭에서 메모리 점진 노출(네트워크 없음).
function RecsFeed({ initial, active }: { initial: ExplorePhoto[]; active: boolean }) {
  const [visible, setVisible] = useState(STEP);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || visible >= initial.length) return;
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible((v) => Math.min(initial.length, v + STEP));
      },
      { rootMargin: "1200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [active, visible, initial.length]);

  return (
    <>
      <PhotoMasonry photos={initial.slice(0, visible)} empty="추천할 사진이 아직 없어요." altLabel="추천 사진" />
      {visible < initial.length && <div ref={sentinel} className="h-1" />}
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
              <Link
                key={p.id}
                href={`/photos/${p.id}`}
                className="block overflow-hidden rounded-2xl bg-fg/[0.05] transition-opacity hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <img
                  src={p.thumb_url ?? p.src_url}
                  alt={altLabel}
                  loading="lazy"
                  style={ratio ? { aspectRatio: ratio } : undefined}
                  className="w-full object-cover"
                />
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}

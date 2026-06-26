"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AddToCartButton } from "@/components/user/cart/AddToCartButton";
import { accentRingIds } from "@/lib/seeded-shuffle";

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
export function PhotoExplore({ initialRecs }: { initialRecs: ExplorePhoto[] }) {
  return (
    <section className="mt-6">
      <RecsFeed initial={initialRecs} />
    </section>
  );
}

// 추천 피드 — 서버가 유사도순 풀을 한 번에 주고, 메모리에서 점진 노출(네트워크 없음).
function RecsFeed({ initial }: { initial: ExplorePhoto[] }) {
  const [visible, setVisible] = useState(STEP);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible >= initial.length) return;
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
  }, [visible, initial.length]);

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
  // 브랜드 테두리 — 노출 순서 기준 가변 간격(6~11)으로만 표시 → 몰리거나 매번 같은 자리 방지
  const accentIds = useMemo(() => accentRingIds(photos), [photos]);
  if (photos.length === 0) {
    return <p className="mt-10 text-center text-sm text-muted">{empty}</p>;
  }
  return (
    <div ref={ref} className="mt-5 flex gap-3">
      {columns.map((col, ci) => (
        <div key={ci} className="flex min-w-0 flex-1 flex-col gap-3">
          {col.map((p) => {
            const ratio = p.width > 0 && p.height > 0 ? `${p.width} / ${p.height}` : undefined;
            const accent = accentIds.has(p.id);
            return (
              <div
                key={p.id}
                data-cart-card
                className={`group relative overflow-hidden rounded-2xl bg-fg/[0.05] ring-4 ${
                  accent ? "ring-brand" : "ring-bg"
                }`}
              >
                <Link
                  href={`/photos/${p.id}`}
                  className="block transition-opacity hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <img
                    src={p.thumb_url ?? p.src_url}
                    alt={altLabel}
                    loading="lazy"
                    style={ratio ? { aspectRatio: ratio } : undefined}
                    className="w-full object-cover"
                  />
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

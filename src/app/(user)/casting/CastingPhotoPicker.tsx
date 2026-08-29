"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";
import { buildMasonryColumns } from "@/lib/masonry";
import { useColumnCount } from "@/components/user/useColumnCount";
import { PICK_MAX, type CastingPickPhoto } from "@/lib/casting";

// 스크롤할 때마다 더 보여줄 사진 수. 탐색 갤러리와 같은 방식 —
// 서버가 전체 풀을 내려주고 클라이언트는 메모리에서 점진 노출한다(네트워크 없음).
const STEP = 48;
const INITIAL = 48;

/**
 * 캐스팅 STEP 2 — 참여 작가들의 포트폴리오에서 찍고 싶은 사진을 고른다.
 *
 * 탐색 갤러리(ExploreGallery)와 같은 메이슨리 레이아웃을 쓴다.
 * 같은 알고리즘을 공유하므로(lib/masonry) 원본 비율이 그대로 살고,
 * 점진 노출로 카드가 늘어나도 이미 보던 사진이 재배치되지 않는다.
 *
 * 다른 점은 하나뿐이다 — 카드를 누르면 사진 상세로 가는 게 아니라 **선택**된다.
 */
export function CastingPhotoPicker({
  photos,
  selected,
  onToggle,
  photographerCount,
}: {
  photos: CastingPickPhoto[];
  selected: string[];
  onToggle: (id: string) => void;
  photographerCount: number;
}) {
  const { cols, ready, setNode } = useColumnCount();
  const [visible, setVisible] = useState(INITIAL);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const columns = useMemo(
    () => buildMasonryColumns(photos.slice(0, visible), cols),
    [photos, visible, cols],
  );

  // 바닥에 닿으면 다음 묶음 노출
  useEffect(() => {
    const el = sentinel.current;
    if (!el || visible >= photos.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((v) => Math.min(v + STEP, photos.length));
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, photos.length]);

  const pickedNames = useMemo(
    () => [...new Set(selected.map((id) => photos.find((p) => p.id === id)?.photographerName).filter(Boolean))],
    [selected, photos],
  );

  if (photos.length === 0) {
    return (
      <p className="rounded-xl bg-fg/[0.04] px-4 py-6 text-center text-xs text-fg/45">
        사진을 준비 중이에요. 곧 다시 열어볼게요.
      </p>
    );
  }

  return (
    <div>
      {/* 선택 현황 — 스크롤해도 몇 장 골랐는지 항상 보이게 */}
      <div className="sticky top-0 z-10 -mx-1 mb-2.5 flex items-center justify-between gap-2 bg-bg/92 px-1 py-2 backdrop-blur">
        <p className="text-xs font-semibold">
          {selected.length}/{PICK_MAX}장 선택
        </p>
        <p className="min-w-0 truncate text-xs text-fg/45">
          {pickedNames.length > 0 ? pickedNames.join(" · ") : `작가 ${photographerCount}명 · 사진 ${photos.length}장`}
        </p>
      </div>

      <div
        ref={setNode}
        className={cn("flex gap-2.5 transition-opacity sm:gap-4", ready ? "opacity-100" : "opacity-0")}
      >
        {columns.map((col, ci) => (
          <div key={ci} className="flex min-w-0 flex-1 flex-col gap-2.5 sm:gap-4">
            {col.map(({ item }) => {
              const on = selected.includes(item.id);
              const full = selected.length >= PICK_MAX && !on;
              const ratio = item.width > 0 && item.height > 0 ? `${item.width} / ${item.height}` : undefined;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={full}
                  aria-pressed={on}
                  aria-label={`${item.photographerName} 작가 사진 ${on ? "선택 해제" : "선택"}`}
                  onClick={() => onToggle(item.id)}
                  className={cn(
                    "group relative block w-full overflow-hidden rounded-xl bg-fg/[0.04] transition-all",
                    on ? "ring-2 ring-fg ring-offset-2 ring-offset-bg" : "hover:opacity-90",
                    full && "opacity-35",
                  )}
                >
                  <Image
                    src={item.url}
                    alt=""
                    width={item.width || 500}
                    height={item.height || 625}
                    sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
                    style={{ width: "100%", height: "auto", aspectRatio: ratio }}
                    className="object-cover"
                  />

                  {on && <span className="absolute inset-0 bg-fg/15" />}

                  {/* 선택 표시 — 몇 번째로 골랐는지까지 보여준다 */}
                  <span
                    className={cn(
                      "absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full text-[12px] font-bold transition-colors",
                      on ? "bg-fg text-bg" : "bg-black/25 text-white/80 backdrop-blur-sm",
                    )}
                  >
                    {on ? selected.indexOf(item.id) + 1 : "+"}
                  </span>

                  {/* 작가명 — 사진으로 고르되 누구 작업인지는 자연스럽게 학습되게 */}
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5 text-left text-[11px] font-medium text-white">
                    {item.photographerName}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {visible < photos.length && (
        <div ref={sentinel} className="py-6 text-center text-xs text-fg/40">
          사진 더 불러오는 중… ({visible}/{photos.length})
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

// 분석 대시보드 — '가장 많이 클릭된 사진'을 실제 썸네일 그리드로.
// 카드 클릭 시 상세 팝업(작가·가격·지역·무드·클릭수 + 실제 사진 페이지 열기).
export type PhotoStat = {
  id: string;
  count: number;
  views?: number; // 사진 상세 조회수(작가 드릴다운에서 사용)
  thumb: string | null;
  src: string | null;
  price: number | null;
  region: string | null;
  tags: string[];
  photographer: string | null;
};

const won = new Intl.NumberFormat("ko-KR");

export function PhotoInsights({ photos, totalClicks }: { photos: PhotoStat[]; totalClicks: number }) {
  const [active, setActive] = useState<PhotoStat | null>(null);

  if (photos.length === 0) {
    return (
      <p className="mt-3 rounded-2xl border border-dashed border-line-strong bg-surface px-4 py-8 text-center text-caption text-faint">
        아직 클릭된 사진이 없어요. 방문자가 사진을 누르면 여기에 실제 사진과 클릭 수가 표시돼요.
      </p>
    );
  }

  const max = photos[0]?.count ?? 1;

  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p, i) => {
          const img = p.thumb || p.src || "";
          const pct = totalClicks > 0 ? Math.round((p.count / totalClicks) * 100) : 0;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setActive(p)}
              aria-label={`${i + 1}위 사진 — ${p.count}회 클릭, 자세히 보기`}
              className="group relative block aspect-[4/5] cursor-pointer overflow-hidden rounded-2xl border border-line bg-surface-2 text-left transition-shadow hover:shadow-pop focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img}
                alt={`${p.photographer ?? "작가"} 사진`}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-opacity group-hover:opacity-95"
              />
              {/* 순위 배지 */}
              <span
                className={cn(
                  "absolute left-2 top-2 grid h-7 min-w-7 place-items-center rounded-full px-2 text-caption font-bold tabular-nums shadow",
                  i === 0 ? "bg-brand text-white" : "bg-black/65 text-white"
                )}
              >
                {i + 1}
              </span>
              {/* 하단 정보 그라데이션 */}
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-2.5 pt-7">
                <span className="block truncate text-caption font-semibold text-white">
                  {p.photographer ?? "작가 미상"}
                </span>
                <span className="mt-0.5 flex items-center justify-between text-[11px] text-white/85">
                  <span className="font-bold tabular-nums">{won.format(p.count)}회 클릭</span>
                  <span className="tabular-nums">{p.views != null ? `조회 ${won.format(p.views)}` : `${pct}%`}</span>
                </span>
                {/* 비율 바 */}
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/25">
                  <span
                    className="block h-full rounded-full bg-white"
                    style={{ width: `${Math.round((p.count / max) * 100)}%` }}
                  />
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {active && <PhotoModal photo={active} onClose={() => setActive(null)} />}
    </>
  );
}

function PhotoModal({ photo, onClose }: { photo: PhotoStat; onClose: () => void }) {
  // ESC 닫기 + 배경 스크롤 잠금
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const img = photo.src || photo.thumb || "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="사진 상세"
      onClick={onClose}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-surface shadow-pop"
      >
        <div className="relative shrink-0 bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt="사진" className="max-h-[55vh] w-full object-contain" />
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="absolute right-3 top-3 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-h3 font-semibold text-fg">{photo.photographer ?? "작가 미상"}</p>
              <p className="text-caption text-muted">{photo.region || "지역 미입력"}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <div className="rounded-xl bg-brand/[0.08] px-3 py-1.5 text-center">
                <p className="text-h3 font-bold tabular-nums text-brand">{won.format(photo.count)}</p>
                <p className="text-[11px] text-brand/80">회 클릭</p>
              </div>
              {photo.views != null && (
                <div className="rounded-xl bg-fg/[0.05] px-3 py-1.5 text-center">
                  <p className="text-h3 font-bold tabular-nums text-fg">{won.format(photo.views)}</p>
                  <p className="text-[11px] text-muted">회 조회</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-fg/[0.04] px-3 py-2.5 text-caption">
            <span className="text-muted">촬영가</span>
            <span className="font-semibold text-fg">
              {photo.price != null ? `₩${won.format(photo.price)}` : "가격 미입력"}
            </span>
          </div>

          {photo.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {photo.tags.map((t) => (
                <span key={t} className="rounded-full bg-fg/[0.06] px-2.5 py-1 text-[11px] text-muted">
                  #{t}
                </span>
              ))}
            </div>
          )}

          <a
            href={`/photos/${photo.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-fg px-4 py-3 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90"
          >
            실제 사진 페이지 열기
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 17L17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}

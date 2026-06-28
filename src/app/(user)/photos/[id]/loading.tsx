"use client";

// 사진 상세 로딩 스켈레톤 — 탭 직후 즉시 노출.
// 갤러리에서 넘겨준 비율(sessionStorage)로 사진 자리를 그려 실제 사진과 크기를 맞춘다.
import { usePathname } from "next/navigation";
import { readPhotoAspect, readFrameAspect } from "@/lib/photo-aspect";
import { RecsSkeleton } from "@/components/user/skeletons";
import { ScrollTop } from "@/components/user/ScrollTop";

export default function Loading() {
  const pathname = usePathname();
  const id = (pathname ?? "").split("/").filter(Boolean).pop() ?? "";
  // 비율: 이전에 본 적 있으면 실제 프레임 비율(세로 가장 긴 사진 기준) 우선,
  // 없으면 갤러리에서 넘긴 클릭 사진 비율, 그것도 없으면 세로 기본(4:5).
  const aspect =
    (typeof window !== "undefined" ? readFrameAspect(id) ?? readPhotoAspect(id) : null) ?? 0.8;

  return (
    <main className="mx-auto max-w-5xl px-2.5 pb-2.5 pt-2.5 font-kr sm:px-4 sm:pt-4 sm:pb-4">
      <ScrollTop />
      <div className="md:flex md:items-start md:gap-8">
        {/* 사진 자리 — 실제 비율 적용 */}
        <div
          className="relative mx-auto w-[min(100%,calc(82svh*var(--ar)))] md:mx-0 md:w-[min(60%,calc(80vh*var(--ar)))]"
          style={{ "--ar": String(aspect) } as React.CSSProperties}
        >
          <div
            className="w-full animate-pulse bg-surface-2"
            style={{ aspectRatio: String(aspect) }}
          />
        </div>

        {/* 정보 자리 — 실제 레이아웃(가격·장소 / 상담 CTA / 작가·상세 토글) 골격 그대로 */}
        <div className="mt-4 w-full md:mt-0 md:min-w-0 md:flex-1">
          {/* 가격 · 장소 */}
          <div className="flex items-baseline gap-2">
            <div className="h-7 w-28 animate-pulse rounded bg-surface-2" />
            <div className="h-4 w-16 animate-pulse rounded bg-surface-2" />
          </div>

          {/* 무료 상담 신청 CTA (브랜드 톤) */}
          <div className="mt-4 h-12 w-full animate-pulse rounded-xl bg-brand/15" />

          {/* 작가 · 상세 정보 토글 (접힘) */}
          <div className="mt-4 flex items-center justify-between border-t border-line pt-3.5">
            <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
            <div className="h-4 w-4 animate-pulse rounded bg-surface-2" />
          </div>
        </div>
      </div>

      {/* 하단 — 추천(탐색) 사진 스켈레톤도 미리 노출 */}
      <RecsSkeleton count={8} />
    </main>
  );
}

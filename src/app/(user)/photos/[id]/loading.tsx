"use client";

// 사진 상세 로딩 스켈레톤 — 탭 직후 즉시 노출.
// 갤러리에서 넘겨준 비율(sessionStorage)로 사진 자리를 그려 실제 사진과 크기를 맞춘다.
//
// ⚠️ 이 파일은 **실제 지면(page.tsx)과 골격이 같아야 한다.**
//    어긋난 만큼 로딩이 끝나는 순간 화면이 밀린다. 실제로 어긋나 있었다 —
//    CTA 가 지면엔 둘(상담·예약)인데 스켈레톤엔 하나, 패키지 카드 자리가 없었고,
//    추천 섹션의 제목·구획선도 빠져 있어 로딩이 끝나면 그만큼 아래가 튀었다.
//    page.tsx 의 블록을 고치면 여기도 같이 고칠 것.
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
        {/* 사진 자리 — 실제 비율 적용. 높이 상한은 globals.css 의 --photo-cap 공용 */}
        <div
          className="photo-frame relative mx-auto md:mx-0 md:sticky md:top-4 md:shrink-0 md:self-start"
          style={{ "--ar": String(aspect) } as React.CSSProperties}
        >
          <div
            className="w-full animate-pulse bg-surface-2"
            style={{ aspectRatio: String(aspect) }}
          />
        </div>

        <div className="mt-4 w-full md:mt-0 md:min-w-0 md:flex-1">
          {/* 공유·담기·작가의 글(좌) · 파트너 뱃지(우) 한 행 */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <div className="h-9 w-9 animate-pulse rounded-full bg-surface-2" />
              <div className="h-9 w-9 animate-pulse rounded-full bg-surface-2" />
              <div className="h-9 w-9 animate-pulse rounded-full bg-surface-2" />
            </div>
            <div className="h-6 w-28 animate-pulse rounded-full bg-surface-2" />
          </div>

          {/* CTA 한 개 — 촬영 문의하기 (h-12). dev 판은 상담/예약 2트랙이라 두 개다. */}
          <div className="mt-4 flex flex-col gap-2">
            <div className="h-12 w-full animate-pulse rounded-2xl bg-brand/15" />
          </div>

          {/* 패키지 카드 자리 — 라벨·이름/가격·사실 세 줄 */}
          <div className="mt-5 rounded-2xl border border-line bg-surface p-4">
            <div className="h-3 w-32 animate-pulse rounded bg-surface-2" />
            <div className="mt-2 flex items-end justify-between gap-3">
              <div className="h-5 w-24 animate-pulse rounded bg-surface-2" />
              <div className="h-6 w-24 animate-pulse rounded bg-surface-2" />
            </div>
            <div className="mt-3 border-t border-line">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center justify-between border-b border-line py-2.5">
                  <div className="h-3 w-16 animate-pulse rounded bg-surface-2" />
                  <div className="h-3 w-20 animate-pulse rounded bg-surface-2" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 하단 — 추천. 지면과 같은 구획선·제목 자리를 미리 잡아 둔다 */}
      <div className="mt-12 border-t border-line pt-6">
        <div className="mb-3 h-5 w-36 animate-pulse rounded bg-surface-2" />
        <RecsSkeleton count={8} />
      </div>
    </main>
  );
}

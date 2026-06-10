"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import Link from "next/link";
import type { GalleryPhoto } from "@/lib/discovery";
import { MoreIcon } from "@/components/user/icons";

const fmt = new Intl.NumberFormat("ko-KR");

// 탐색 갤러리 — 서버에서 받은 사진 목록을 그대로 유지하며 가격 표시만 클라이언트 토글
// (가격 토글이 페이지를 재요청하지 않으므로 사진이 다시 셔플되지 않음)
export function ExploreGallery({
  photos,
  query,
}: {
  photos: GalleryPhoto[];
  query?: string;
}) {
  const [showPrice, setShowPrice] = useState(false);

  return (
    <>
      {/* 상단 도구줄 — 검색 결과 수 + 가격 보기 토글 */}
      <div className="flex items-center justify-between gap-2 px-1 pt-4">
        <p className="text-sm text-fg/55">
          {query ? `“${query}” 태그 결과 ${photos.length}장` : ""}
        </p>
        <PriceToggle on={showPrice} onToggle={() => setShowPrice((v) => !v)} />
      </div>

      {/* 메이슨리 갤러리 */}
      {photos.length === 0 ? (
        <p className="mt-16 text-center text-sm text-fg/45">
          {query
            ? "해당 태그의 사진이 아직 없어요. 다른 키워드로 검색해보세요."
            : "공개된 사진이 아직 없어요."}
        </p>
      ) : (
        <div className="mt-4 columns-2 gap-3 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 2xl:columns-7 [&>*]:mb-3">
          {photos.map((photo) => (
            <PhotoCard key={photo.id} photo={photo} showPrice={showPrice} />
          ))}
        </div>
      )}
    </>
  );
}

// 가격 표시 on/off 토글 (네비게이션 없이 부모 상태만 변경)
function PriceToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
        on ? "bg-fg text-bg" : "bg-fg/[0.06] text-fg/70 hover:bg-fg/[0.1]"
      }`}
    >
      <span className="font-semibold">₩</span>
      가격 {on ? "켜짐" : "보기"}
    </button>
  );
}

// 핀터레스트식 핀 카드 — 라운드 타일 + 호버 시 작가명/더보기 오버레이
function PhotoCard({
  photo,
  showPrice,
}: {
  photo: GalleryPhoto;
  showPrice: boolean;
}) {
  const name = photo.photographer.display_name || "작가";
  return (
    <Link
      href={`/photos/${photo.id}`}
      className="group relative block break-inside-avoid overflow-hidden rounded-2xl bg-fg/[0.05]"
    >
      <img
        src={photo.thumb_url ?? photo.src_url}
        alt=""
        loading="lazy"
        className="w-full object-cover"
      />

      {/* 가격 표시 (토글 ON + 가격 설정된 사진만) */}
      {showPrice && photo.price_krw != null && (
        <span className="absolute left-2 top-2 rounded-full bg-fg/85 px-2 py-0.5 text-xs font-semibold text-bg">
          ₩{fmt.format(photo.price_krw)}
        </span>
      )}

      {/* 호버 오버레이 */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between bg-black/0 p-2 opacity-0 transition-opacity group-hover:bg-black/15 group-hover:opacity-100">
        <div className="flex justify-end">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-fg shadow-sm">
            <MoreIcon />
          </span>
        </div>
        <span className="line-clamp-1 rounded-md bg-black/45 px-2 py-1 text-xs font-medium text-white">
          {name}
        </span>
      </div>
    </Link>
  );
}

"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GalleryPhoto } from "@/lib/discovery";
import { togglePhotoLike } from "@/app/(user)/actions";
import { cn } from "@/lib/cn";
import { HeartIcon, SearchIcon } from "@/components/user/icons";
import { EmptyState } from "@/components/ui";

const fmt = new Intl.NumberFormat("ko-KR");

// 탐색 갤러리 — 서버에서 받은 사진 목록을 그대로 유지하며 가격·작가명 표시만 클라이언트 토글
// (토글이 페이지를 재요청하지 않으므로 사진이 다시 셔플되지 않음)
export function ExploreGallery({
  photos,
  query,
  likedIds = [],
}: {
  photos: GalleryPhoto[];
  query?: string;
  likedIds?: string[];
}) {
  const [showPrice, setShowPrice] = useState(false);
  const [showName, setShowName] = useState(false);
  const likedSet = new Set(likedIds);

  // 보기 옵션(가격·작가명) — 세션 유지 + SearchOptions 토글과 이벤트로 동기화
  useEffect(() => {
    setShowPrice(sessionStorage.getItem("explore:showPrice") === "1");
    setShowName(sessionStorage.getItem("explore:showName") === "1");
    function onPrice(e: Event) {
      setShowPrice((e as CustomEvent).detail as boolean);
    }
    function onName(e: Event) {
      setShowName((e as CustomEvent).detail as boolean);
    }
    window.addEventListener("samae:price-toggle", onPrice);
    window.addEventListener("samae:name-toggle", onName);
    return () => {
      window.removeEventListener("samae:price-toggle", onPrice);
      window.removeEventListener("samae:name-toggle", onName);
    };
  }, []);

  if (photos.length === 0) {
    return (
      <EmptyState
        icon={<SearchIcon className="h-6 w-6" />}
        title={query ? `“${query}” 결과가 없어요` : "공개된 사진이 아직 없어요"}
        description={
          query
            ? "다른 무드 키워드로 검색해보세요. (예: 감성, 흑백, 우드톤)"
            : "작가들이 작품을 올리면 여기에 표시돼요."
        }
        action={
          query ? (
            <Link
              href="/"
              className="rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg hover:bg-fg/90"
            >
              전체 둘러보기
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      {/* 검색 결과 수 — 검색했을 때만 */}
      {query && (
        <p className="px-1 pt-4 text-sm text-muted">
          “{query}” 결과 {photos.length}장
        </p>
      )}

      {/* 메이슨리 갤러리 */}
      <div className="columns-2 gap-3 pt-3 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 2xl:columns-7 [&>*]:mb-3">
        {photos.map((photo) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            showPrice={showPrice}
            showName={showName}
            liked={likedSet.has(photo.id)}
          />
        ))}
      </div>
    </>
  );
}

// 핀터레스트식 핀 카드 — 비율 예약(레이아웃 점프 방지) + 찜(하트) + 옵션 표시(가격·작가명)
function PhotoCard({
  photo,
  showPrice,
  showName,
  liked,
}: {
  photo: GalleryPhoto;
  showPrice: boolean;
  showName: boolean;
  liked: boolean;
}) {
  const name = photo.photographer.display_name || "작가";
  const tags = (photo.mood_tags ?? []).slice(0, 3).join(", ");
  const alt = tags ? `${name} 작품 · ${tags}` : `${name} 작품`;
  // DB 비율로 공간 예약 → 이미지 로드 시 레이아웃 점프 제거
  const ratio =
    photo.width > 0 && photo.height > 0 ? `${photo.width} / ${photo.height}` : undefined;

  return (
    <div className="group relative break-inside-avoid overflow-hidden rounded-2xl bg-fg/[0.05]">
      <Link href={`/photos/${photo.id}`} className="block">
        <img
          src={photo.thumb_url ?? photo.src_url}
          alt={alt}
          loading="lazy"
          style={ratio ? { aspectRatio: ratio } : undefined}
          className="w-full object-cover"
        />
      </Link>

      {/* 가격 표시 (토글 ON + 가격 설정된 사진만) */}
      {showPrice && photo.price_krw != null && (
        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-fg/85 px-2 py-0.5 text-xs font-semibold text-bg">
          ₩{fmt.format(photo.price_krw)}
        </span>
      )}

      {/* 찜(하트) — hover(또는 키보드 포커스) 시에만 노출, 평소엔 사진에 집중 */}
      <LikeHeart photoId={photo.id} liked={liked} />

      {/* 작가명 (토글 ON일 때만) */}
      {showName && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-2.5 pb-2 pt-6 text-xs font-medium text-white">
          <span className="line-clamp-1">{name}</span>
        </span>
      )}
    </div>
  );
}

// 갤러리 좋아요 버튼 — 옵티미스틱(셔플/재요청 없음). 비로그인은 로그인으로.
function LikeHeart({ photoId, liked: initial }: { photoId: string; liked: boolean }) {
  const [liked, setLiked] = useState(initial);
  const [, start] = useTransition();
  const router = useRouter();

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const optimistic = !liked;
    setLiked(optimistic);
    start(async () => {
      const res = await togglePhotoLike(photoId);
      if (!res.loggedIn) {
        setLiked(false);
        router.push(`/login?next=${encodeURIComponent(`/photos/${photoId}?like=1`)}`);
        return;
      }
      setLiked(res.liked);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={liked}
      aria-label={liked ? "좋아요 취소" : "좋아요"}
      className={cn(
        "absolute right-2 top-2 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-white/90 opacity-0 shadow-sm backdrop-blur transition-opacity hover:bg-white group-hover:opacity-100 focus-visible:opacity-100",
        liked ? "text-brand" : "text-fg/70"
      )}
    >
      <HeartIcon className="h-5 w-5" filled={liked} />
    </button>
  );
}

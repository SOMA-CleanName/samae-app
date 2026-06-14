/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  fetchPhotoById,
  fetchAlbumPhotos,
  fetchAlbumDescription,
  fetchPhotographerById,
  fetchPhotographerPhotos,
  fetchPhotoLikeInfo,
} from "@/lib/discovery";
import { getCurrentUser } from "@/lib/auth";
import { loadExplorePhotos } from "@/app/(user)/actions";
import { PhotoCarousel } from "./PhotoCarousel";
import { PhotoExplore } from "./PhotoExplore";
import { PhotoTopBar } from "./PhotoTopBar";
import { AutoFavorite } from "@/components/user/AutoFavorite";
import { ChevronRightIcon } from "@/components/user/icons";
import { Avatar, Button } from "@/components/ui";

const fmt = new Intl.NumberFormat("ko-KR");

export default async function PhotoDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ like?: string; mock?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const photo = await fetchPhotoById(id);
  if (!photo) notFound();

  // 상단 정보에 필요한 것들 병렬 조회
  const [ph, me, portfolio, initialRecs] = await Promise.all([
    fetchPhotographerById(photo.photographer_id),
    getCurrentUser(),
    fetchPhotographerPhotos(photo.photographer_id),
    loadExplorePhotos(photo.id, 0),
  ]);
  if (!ph) notFound();

  const isOwner = me?.photographer?.id === ph.id;
  const location = photo.location_text || photo.region || null;
  const phName = ph.display_name || "작가";

  // 게시물(묶음)이면 같은 게시물 사진들을 스와이프용으로 (클릭한 사진부터)
  const albumPhotos = photo.album_id ? await fetchAlbumPhotos(photo.album_id) : [];
  const albumDescription = photo.album_id ? await fetchAlbumDescription(photo.album_id) : null;
  const baseCarousel =
    albumPhotos.length > 1
      ? albumPhotos
      : [
          {
            id: photo.id,
            src_url: photo.src_url,
            thumb_url: photo.thumb_url,
            width: photo.width,
            height: photo.height,
          },
        ];

  // 슬라이드별 좋아요 정보 — 보고 있는 사진만 정확히 좋아요되도록
  const likeInfo = await fetchPhotoLikeInfo(baseCarousel.map((p) => p.id), me?.id);
  const carousel = baseCarousel.map((p) => ({
    ...p,
    liked: likeInfo[p.id]?.liked ?? false,
    count: likeInfo[p.id]?.count ?? 0,
  }));
  const startIndex = Math.max(0, carousel.findIndex((p) => p.id === photo.id));

  // 게시물 프레임 비율 = 대표(첫) 사진 기준 고정 → 스와이프해도 캐러셀이 출렁이지 않음.
  // 각 사진은 이 프레임 안에서 안 잘리게(contain) 들어가고 남는 공간은 흐린 배경으로 채움.
  const cover = baseCarousel[0];
  const aspect = cover.width && cover.height ? cover.width / cover.height : 1;

  // 로그인 복귀 후 의도했던 좋아요 자동 적용 (아직 안 한 경우에만)
  const liked = likeInfo[photo.id]?.liked ?? false;
  const autoLike = sp.like === "1" && !!me && !liked;

  // 사진별 작가 글 — 컬럼 연동 전 미리보기용 목데이터(?mock=1). photo.caption ?? 앨범 설명.
  const mockCaption =
    "늦은 오후, 햇살이 가장 부드러워지는 시간에 담았어요. 인물의 자연스러운 표정과 빛의 결을 살리려고 노출을 살짝 낮췄고, 배경의 우드톤이 인물과 잘 어우러지도록 자리를 잡았습니다. 편안하게 웃어주신 덕분에 좋은 컷이 많이 나왔어요. 이런 무드를 좋아하시면 비슷한 톤으로 더 찍어드릴 수 있어요.";
  const caption = sp.mock === "1" ? mockCaption : photo.caption;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-8 pt-20 font-kr sm:px-6 md:pt-24">
      {autoLike && <AutoFavorite targetType="photo" targetId={photo.id} path={`/photos/${photo.id}`} />}
      <div className="md:flex md:items-start md:gap-8">
        {/* 사진 (게시물이면 스와이프) — 비율에 맞춰 너비 가변 */}
        <div
          className="md:sticky md:top-20 md:shrink-0 md:self-start md:w-[min(60%,calc(80vh*var(--ar)))]"
          style={{ "--ar": String(aspect) } as React.CSSProperties}
        >
          <PhotoCarousel
            photos={carousel}
            startIndex={startIndex}
            pagePath={`/photos/${photo.id}`}
            photographerName={phName}
            frameAspect={aspect}
          />
        </div>

        {/* 사진 정보 — 비율로 밀린 나머지 폭을 채움 */}
        <div className="mt-6 md:mt-0 md:min-w-0 md:flex-1">
          {/* 작가 — '작가 사진 보러가기' (§2-5) */}
          <Link
            href={`/photographers/${ph.id}`}
            className="flex items-center gap-3 rounded-2xl border border-line p-3 transition-colors hover:bg-surface-2"
          >
            <Avatar name={phName} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-semibold">{phName}</span>
              <span className="block text-caption text-muted">작가 사진 보러가기</span>
            </span>
            <ChevronRightIcon className="h-4 w-4 shrink-0 text-faint" />
          </Link>

          {/* 작가 글 — 사진별 caption(추후 photos.caption 연동) 우선, 없으면 게시물(앨범) 설명.
              dev 머지 후 DB 컬럼 추가 + fetchPhotoById select 만 더하면 사진별로 자동 노출. */}
          {(caption || albumDescription) && (
            <p className="mt-5 whitespace-pre-wrap text-body text-fg/80">
              {caption || albumDescription}
            </p>
          )}

          {/* 무드 태그 */}
          {photo.mood_tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {photo.mood_tags.map((m) => (
                <span
                  key={m}
                  className="rounded-full bg-fg/[0.06] px-2.5 py-1 text-caption text-fg/70"
                >
                  #{m}
                </span>
              ))}
            </div>
          )}

          {/* 메타 — [3안] 한 줄 메타(가격 강조 · 장소 멋) */}
          <p className="mt-6">
            <span className="text-title font-semibold tracking-tight">
              {photo.price_krw != null ? `₩${fmt.format(photo.price_krw)}` : "문의"}
            </span>
            {location && <span className="text-body text-muted"> · {location}</span>}
          </p>

          {/* 예약·문의 (좋아요는 캐러셀 위에 표시) */}
          <PhotoCtas isOwner={isOwner} me={!!me} photographerId={ph.id} photoId={photo.id} />
        </div>
      </div>

      {/* 2단계 상단바 — 항상 고정 (뒤로가기 + 검색) */}
      <PhotoTopBar />

      {/* 하단 — 추천(무한 스크롤) ↔ 작가 포트폴리오 탭 (§2-8, §2-9) */}
      <PhotoExplore
        photoId={photo.id}
        initialRecs={initialRecs}
        portfolio={portfolio.map((p) => ({ id: p.id, src_url: p.src_url, thumb_url: p.thumb_url }))}
        photographerName={phName}
      />
    </main>
  );
}

// 문의/예약 CTA
function PhotoCtas({
  isOwner,
  me,
  photographerId,
  photoId,
}: {
  isOwner: boolean;
  me: boolean;
  photographerId: string;
  photoId: string;
}) {
  if (isOwner) {
    return (
      <Button href="/studio" variant="secondary" size="lg" fullWidth className="mt-6">
        내 사진입니다 — 스튜디오로
      </Button>
    );
  }
  if (!me) {
    return (
      <Button
        href={`/login?next=${encodeURIComponent(inquiryHref(photographerId, photoId))}`}
        size="lg"
        fullWidth
        className="mt-6"
      >
        로그인하고 예약·문의하기
      </Button>
    );
  }
  return (
    <Button href={inquiryHref(photographerId, photoId)} size="lg" fullWidth className="mt-6">
      예약·문의하기
    </Button>
  );
}

function inquiryHref(photographerId: string, photoId: string) {
  const params = new URLSearchParams({ photographerId, photoId });
  return `/inquiry?${params.toString()}`;
}

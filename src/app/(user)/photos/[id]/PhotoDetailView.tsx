import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  fetchPhotoById,
  fetchAlbumPhotos,
  fetchAlbumDescription,
  fetchPhotographerById,
  fetchPhotoLikeInfo,
  fetchSimilarPhotos,
  newFeedSeed,
} from "@/lib/discovery";
import { loadMorePhotos } from "../../feed-actions";
import { getCurrentUser } from "@/lib/auth";
import { PhotoCarousel } from "./PhotoCarousel";
import { PhotoExplore } from "./PhotoExplore";
import { RecsSkeleton } from "@/components/user/skeletons";
import { ScrollTop } from "@/components/user/ScrollTop";
import { RememberFrameAspect } from "./RememberFrameAspect";
import { ShareButton } from "@/components/user/ShareButton";
import { AddToCartButton } from "@/components/user/cart/AddToCartButton";
import { PhotoTopBar } from "./PhotoTopBar";
import { DetailMoreInfo } from "./DetailMoreInfo";
import { NavRevealOnScroll } from "@/components/user/NavReveal";
import { OwnerPhotoBackButton } from "./OwnerPhotoBackButton";
import { AutoFavorite } from "@/components/user/AutoFavorite";
import { PixelViewContent } from "@/components/PixelViewContent";
import { Button } from "@/components/ui";
import { photoImageJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";

const fmt = new Intl.NumberFormat("ko-KR");

// 사진 상세 본문 — 전체 페이지(photos/[id]/page.tsx)와 인터셉트 모달(@modal/(.)photos/[id])이
// 공유한다. inModal=true 면 창(window) 스크롤을 건드리는 ScrollTop 을 건너뛴다
// (모달은 자체 패널 안에서 스크롤하며, 뒤 목록의 스크롤을 보존해야 하므로).
export async function PhotoDetailView({
  id,
  like,
  mock,
  inModal = false,
}: {
  id: string;
  like?: string;
  mock?: string;
  inModal?: boolean;
}) {
  const photo = await fetchPhotoById(id);
  if (!photo) notFound();

  const [ph, me] = await Promise.all([
    fetchPhotographerById(photo.photographer_id),
    getCurrentUser(),
  ]);
  if (!ph) notFound();

  const isOwner = me?.photographer?.id === ph.id;
  const location = photo.location_text || photo.region || null;

  const [albumPhotos, albumDescription] = photo.album_id
    ? await Promise.all([fetchAlbumPhotos(photo.album_id), fetchAlbumDescription(photo.album_id)])
    : [[], null];
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

  const likeInfo = await fetchPhotoLikeInfo(baseCarousel.map((p) => p.id), me?.id);
  const carousel = baseCarousel.map((p) => ({
    ...p,
    liked: likeInfo[p.id]?.liked ?? false,
    count: likeInfo[p.id]?.count ?? 0,
  }));
  const startIndex = Math.max(0, carousel.findIndex((p) => p.id === photo.id));

  const aspect = photo.width && photo.height ? photo.width / photo.height : 1;

  const liked = likeInfo[photo.id]?.liked ?? false;
  const autoLike = like === "1" && !!me && !liked;

  const mockCaption =
    "늦은 오후, 햇살이 가장 부드러워지는 시간에 담았어요. 인물의 자연스러운 표정과 빛의 결을 살리려고 노출을 살짝 낮췄고, 배경의 우드톤이 인물과 잘 어우러지도록 자리를 잡았습니다. 편안하게 웃어주신 덕분에 좋은 컷이 많이 나왔어요. 이런 무드를 좋아하시면 비슷한 톤으로 더 찍어드릴 수 있어요.";
  const caption = mock === "1" ? mockCaption : photo.caption;

  return (
    <div className="mx-auto max-w-5xl px-2.5 pb-2.5 pt-2.5 font-kr sm:px-4 sm:pt-4 sm:pb-4">
      <JsonLd data={photoImageJsonLd(photo)} />
      {!inModal && <ScrollTop />}
      <RememberFrameAspect id={photo.id} aspect={aspect} />
      {autoLike && <AutoFavorite targetType="photo" targetId={photo.id} path={`/photos/${photo.id}`} />}
      <PixelViewContent
        id={photo.id}
        photographerId={photo.photographer_id}
        category={photo.mood_tags ?? null}
        region={photo.region ?? photo.location_text ?? null}
        price={photo.price_krw ?? null}
        disabled={isOwner}
      />
      <div className="md:flex md:items-start md:gap-8">
        <div
          className="relative mx-auto w-[min(100%,calc(82svh*var(--ar)))] md:mx-0 md:sticky md:top-4 md:shrink-0 md:self-start md:w-[min(60%,calc(80vh*var(--ar)))]"
          style={{ "--ar": String(aspect) } as React.CSSProperties}
        >
          <PhotoCarousel photos={carousel} startIndex={startIndex} frameAspect={aspect} />
          <PhotoTopBar />
        </div>

        <div className="mt-4 md:mt-0 md:min-w-0 md:flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <ShareButton photoId={photo.id} />
              <AddToCartButton
                variant="row"
                item={{
                  id: photo.id,
                  src: photo.thumb_url ?? photo.src_url,
                  w: photo.width ?? 0,
                  h: photo.height ?? 0,
                }}
              />
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <p className="min-w-0 text-right">
                {photo.price_krw != null && (
                  <span className="text-title font-semibold tracking-tight">
                    ₩{fmt.format(photo.price_krw)}
                  </span>
                )}
                {location && (
                  <span className="text-body text-muted">
                    {photo.price_krw != null ? " · " : ""}
                    {location}
                  </span>
                )}
              </p>
            </div>
          </div>

          <PhotoCtas isOwner={isOwner} photographerId={ph.id} photoId={photo.id} />

          <NavRevealOnScroll />

          <DetailMoreInfo
            photographerId={ph.id}
            avatarUrl={ph.avatar_url}
            caption={caption || albumDescription}
          />
        </div>
      </div>

      <Suspense fallback={<RecsSkeleton />}>
        <Recommendations photoId={photo.id} albumId={photo.album_id} tags={photo.mood_tags ?? []} />
      </Suspense>
    </div>
  );
}

function PhotoCtas({
  isOwner,
  photographerId,
  photoId,
}: {
  isOwner: boolean;
  photographerId: string;
  photoId: string;
}) {
  if (isOwner) {
    return <OwnerPhotoBackButton />;
  }
  return (
    <Button
      href={inquiryHref(photographerId, photoId)}
      variant="brand"
      size="lg"
      fullWidth
      className="mt-4"
      data-track="cta:inquiry"
    >
      무료로 상담 신청하기
    </Button>
  );
}

function inquiryHref(photographerId: string, photoId: string) {
  const params = new URLSearchParams({ photographerId, photoId });
  return `/inquiry?${params.toString()}`;
}

async function Recommendations({
  photoId,
  albumId,
  tags,
}: {
  photoId: string;
  albumId: string | null;
  tags: string[];
}) {
  const recs = await fetchSimilarPhotos({ photoId, albumId, tags });
  return (
    <PhotoExplore
      initialRecs={recs.slice(0, 120)}
      feedSeed={newFeedSeed()}
      loadMore={loadMorePhotos}
      excludeId={photoId}
    />
  );
}

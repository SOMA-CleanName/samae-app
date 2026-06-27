/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import {
  fetchPhotoById,
  fetchAlbumPhotos,
  fetchAlbumDescription,
  fetchPhotographerById,
  fetchPhotoLikeInfo,
  fetchSimilarPhotos,
} from "@/lib/discovery";
import { getCurrentUser } from "@/lib/auth";
import { PhotoCarousel } from "./PhotoCarousel";
import { PhotoExplore } from "./PhotoExplore";
import { PhotoTopBar } from "./PhotoTopBar";
import { DetailHookCta } from "./DetailHookCta";
import { DetailMoreInfo } from "./DetailMoreInfo";
import { OwnerPhotoBackButton } from "./OwnerPhotoBackButton";
import { AutoFavorite } from "@/components/user/AutoFavorite";
import { PixelViewContent } from "@/components/PixelViewContent";
import { Button } from "@/components/ui";

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
  const [ph, me, initialRecs] = await Promise.all([
    fetchPhotographerById(photo.photographer_id),
    getCurrentUser(),
    // 추천 — 현재 사진 태그와 겹침 점수순(현재 게시물 제외), 풀 전체를 클라이언트가 점진 노출
    fetchSimilarPhotos({ photoId: photo.id, albumId: photo.album_id, tags: photo.mood_tags ?? [] }),
  ]);
  if (!ph) notFound();

  const isOwner = me?.photographer?.id === ph.id;
  const location = photo.location_text || photo.region || null;

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
    <main className="mx-auto max-w-5xl px-4 pb-8 pt-4 font-kr sm:px-6 sm:pt-6">
      {autoLike && <AutoFavorite targetType="photo" targetId={photo.id} path={`/photos/${photo.id}`} />}
      {/* Meta 픽셀 ViewContent — 작가명 노출 금지(content_name 익명) */}
      <PixelViewContent id={photo.id} disabled={isOwner} />
      <div className="md:flex md:items-start md:gap-8">
        {/* 사진 — 화면 최상단. 뒤로가기·공유는 이미지 위 오버레이 */}
        <div
          className="relative mx-auto w-[min(100%,calc(82svh*var(--ar)))] md:mx-0 md:sticky md:top-4 md:shrink-0 md:self-start md:w-[min(60%,calc(80vh*var(--ar)))]"
          style={{ "--ar": String(aspect) } as React.CSSProperties}
        >
          <PhotoCarousel
            photos={carousel}
            startIndex={startIndex}
            pagePath={`/photos/${photo.id}`}
            frameAspect={aspect}
          />
          {/* 좌상단 투명 뒤로가기 (담기·공유는 carousel 내부에서 사진 모서리에 붙음) */}
          <PhotoTopBar />
        </div>

        {/* 사진 정보 — 가격·CTA 먼저 보이고, 작가·글·태그는 접기 */}
        <div className="mt-4 md:mt-0 md:min-w-0 md:flex-1">
          <p>
            <span className="text-title font-semibold tracking-tight">
              {photo.price_krw != null ? `₩${fmt.format(photo.price_krw)}` : "문의"}
            </span>
            {location && <span className="text-body text-muted"> · {location}</span>}
          </p>

          {/* 예약·문의 CTA — 가장 위 (전환 최우선) */}
          <PhotoCtas isOwner={isOwner} photographerId={ph.id} photoId={photo.id} />

          {/* 작가·글·태그 — 기본 접힘, 누르면 펼침 */}
          <DetailMoreInfo
            photographerId={ph.id}
            avatarUrl={ph.avatar_url}
            caption={caption || albumDescription}
            moodTags={photo.mood_tags}
          />
        </div>
      </div>

      {/* 하단 — 추천 사진 무한 스크롤 (작가 사진 탭 제거) */}
      <PhotoExplore initialRecs={initialRecs} />

      {/* A11 혜택 hook — 스크롤 내리면 노출, 예약/장바구니 1회 후 숨김 */}
      {!isOwner && <DetailHookCta href={inquiryHref(ph.id, photo.id)} />}
    </main>
  );
}

// 문의/예약 CTA
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
  // 주 전환 CTA — 혜택형 카피로 클릭 욕구 자극(로그인 무관, /inquiry 에서 처리)
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

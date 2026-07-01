import { Suspense } from "react";
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
import { RecsSkeleton } from "@/components/user/skeletons";
import { ScrollTop } from "@/components/user/ScrollTop";
import { RememberFrameAspect } from "./RememberFrameAspect";
import { ShareButton } from "@/components/user/ShareButton";
import { AddToCartButton } from "@/components/user/cart/AddToCartButton";
import { PhotoTopBar } from "./PhotoTopBar";
import { DetailHookCta } from "./DetailHookCta";
import { DetailMoreInfo } from "./DetailMoreInfo";
import { NavRevealOnScroll } from "@/components/user/NavReveal";
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

  // 상단(즉시 노출)에 필요한 것만 병렬 조회. 추천(400장 조회+스코어링)은 첫 화면을
  // 막지 않도록 아래 <Suspense>에서 따로 스트리밍한다.
  const [ph, me] = await Promise.all([
    fetchPhotographerById(photo.photographer_id),
    getCurrentUser(),
  ]);
  if (!ph) notFound();

  const isOwner = me?.photographer?.id === ph.id;
  const location = photo.location_text || photo.region || null;

  // 게시물(묶음)이면 같은 게시물 사진들을 스와이프용으로 (클릭한 사진부터) — 두 조회 병렬
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

  // 슬라이드별 좋아요 정보 — 보고 있는 사진만 정확히 좋아요되도록
  const likeInfo = await fetchPhotoLikeInfo(baseCarousel.map((p) => p.id), me?.id);
  const carousel = baseCarousel.map((p) => ({
    ...p,
    liked: likeInfo[p.id]?.liked ?? false,
    count: likeInfo[p.id]?.count ?? 0,
  }));
  const startIndex = Math.max(0, carousel.findIndex((p) => p.id === photo.id));

  // 게시물 프레임 비율 = 진입한(클릭한) 그 사진 기준 → 탐색·추천에서 누른 사진이 자기
  // 비율로 보이고, 로딩 스켈레톤(클릭 사진 비율)과도 정확히 일치한다.
  // 앨범의 다른 사진은 이 프레임 안에 잘리지 않게(contain) 들어가고 여백은 흐린 배경.
  const aspect = photo.width && photo.height ? photo.width / photo.height : 1;

  // 로그인 복귀 후 의도했던 좋아요 자동 적용 (아직 안 한 경우에만)
  const liked = likeInfo[photo.id]?.liked ?? false;
  const autoLike = sp.like === "1" && !!me && !liked;

  // 사진별 작가 글 — 컬럼 연동 전 미리보기용 목데이터(?mock=1). photo.caption ?? 앨범 설명.
  const mockCaption =
    "늦은 오후, 햇살이 가장 부드러워지는 시간에 담았어요. 인물의 자연스러운 표정과 빛의 결을 살리려고 노출을 살짝 낮췄고, 배경의 우드톤이 인물과 잘 어우러지도록 자리를 잡았습니다. 편안하게 웃어주신 덕분에 좋은 컷이 많이 나왔어요. 이런 무드를 좋아하시면 비슷한 톤으로 더 찍어드릴 수 있어요.";
  const caption = sp.mock === "1" ? mockCaption : photo.caption;

  return (
    <main className="mx-auto max-w-5xl px-2.5 pb-2.5 pt-2.5 font-kr sm:px-4 sm:pt-4 sm:pb-4">
      <ScrollTop />
      <RememberFrameAspect id={photo.id} aspect={aspect} />
      {autoLike && <AutoFavorite targetType="photo" targetId={photo.id} path={`/photos/${photo.id}`} />}
      {/* Meta 픽셀 ViewContent — 작가명 노출 금지(content_name 익명) */}
      <PixelViewContent id={photo.id} disabled={isOwner} />
      <div className="md:flex md:items-start md:gap-8">
        {/* 사진 — 화면 최상단. 뒤로가기·공유는 이미지 위 오버레이 */}
        <div
          className="relative mx-auto w-[min(100%,calc(82svh*var(--ar)))] md:mx-0 md:sticky md:top-4 md:shrink-0 md:self-start md:w-[min(60%,calc(80vh*var(--ar)))]"
          style={{ "--ar": String(aspect) } as React.CSSProperties}
        >
          <PhotoCarousel photos={carousel} startIndex={startIndex} frameAspect={aspect} />
          {/* 좌상단 투명 뒤로가기 (담기·공유는 carousel 내부에서 사진 모서리에 붙음) */}
          <PhotoTopBar />
        </div>

        {/* 사진 정보 — 가격·CTA 먼저 보이고, 작가·글·태그는 접기 */}
        <div className="mt-4 md:mt-0 md:min-w-0 md:flex-1">
          {/* 공유·담기(좌) · 가격(우) 한 행 */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <ShareButton />
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
            <p className="text-right">
              <span className="text-title font-semibold tracking-tight">
                {photo.price_krw != null ? `₩${fmt.format(photo.price_krw)}` : "문의"}
              </span>
              {location && <span className="text-body text-muted"> · {location}</span>}
            </p>
          </div>

          {/* 첫 촬영 할인 배지 — CTA 바로 위(프라이밍). 스크롤 후 hook 전에도 혜택을 즉시 인지 */}
          {!isOwner && (
            <p className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-body-sm font-medium text-brand-ink">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-brand text-[10px] font-bold leading-none text-white">
                %
              </span>
              지금 신청하면 <b className="font-bold">첫 촬영 할인</b>
            </p>
          )}

          {/* 예약·문의 CTA — 가장 위 (전환 최우선) */}
          <PhotoCtas isOwner={isOwner} photographerId={ph.id} photoId={photo.id} />

          {/* 작가 상세정보 라인 — 이 지점이 화면 상단 50%에 닿으면 플로팅 내비 노출 */}
          <NavRevealOnScroll />

          {/* 작가·글·태그 — 기본 접힘, 누르면 펼침 */}
          <DetailMoreInfo
            photographerId={ph.id}
            avatarUrl={ph.avatar_url}
            caption={caption || albumDescription}
          />
        </div>
      </div>

      {/* 하단 — 추천 사진. Suspense 로 분리해 상단(사진·CTA)을 먼저 렌더하고 추천은 스트리밍.
          400장 조회+스코어링이 더 이상 첫 화면(LCP)을 막지 않는다. */}
      <Suspense fallback={<RecsSkeleton />}>
        <Recommendations photoId={photo.id} albumId={photo.album_id} tags={photo.mood_tags ?? []} />
      </Suspense>

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

// 추천 사진 — 별도 스트리밍 경계. 400장 조회+스코어링이 상단 렌더(LCP)를 막지 않게 분리.
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
  return <PhotoExplore initialRecs={recs.slice(0, 120)} />;
}


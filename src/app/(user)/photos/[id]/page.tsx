import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  fetchPhotoById,
  fetchAlbumPhotos,
  fetchAlbumDescription,
  fetchPhotographerById,
  fetchPhotographerPackages,
  fetchPhotoLikeInfo,
  fetchSimilarPhotos,
  newFeedSeed,
} from "@/lib/discovery";
import { fetchGuideImages } from "@/lib/guide-images";
import { loadMorePhotos } from "../../feed-actions";
import { getCurrentUser } from "@/lib/auth";
import { PhotoCarousel } from "./PhotoCarousel";
import { PhotoExplore } from "./PhotoExplore";
import { loadRankedDetailPhotos } from "../../feed-actions";
import { RecsSkeleton } from "@/components/user/skeletons";
import { ScrollTop } from "@/components/user/ScrollTop";
import { RememberFrameAspect } from "./RememberFrameAspect";
import { ShareButton } from "@/components/user/ShareButton";
import { AddToCartButton } from "@/components/user/cart/AddToCartButton";
import { PhotoTopBar } from "./PhotoTopBar";
import { DetailMoreInfo } from "./DetailMoreInfo";
import { PhotoCtas } from "./PhotoCtas";
import { CaptionOverlay, CaptionProvider, CaptionToggleButton } from "./CaptionOverlay";
import { PackageInfoSection } from "./PackageInfoSection";
import { DetailSection } from "./DetailSection";
import { GuideImageGallery } from "@/components/user/GuideImageGallery";
import { NavRevealOnScroll } from "@/components/user/NavReveal";
import { OwnerPhotoBackButton } from "./OwnerPhotoBackButton";
import { AutoFavorite } from "@/components/user/AutoFavorite";
import { PartnerBadge } from "@/components/user/PartnerBadge";
import { PixelViewContent } from "@/components/PixelViewContent";
import {} from "@/components/ui";
import type { Metadata } from "next";
import { photoMetadata, photoImageJsonLd, photoTitle } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { SearchDock } from "@/components/user/SearchDock";
import { pickSearchPlaceholder } from "@/lib/search-copy";
import { shouldShowSearchUi } from "@/lib/search-ui-visibility";

// 사진 가격에 가장 가까운(가격 차 최소) 활성 패키지. 정확 일치 시 차=0. 패키지 없으면 null.
function nearestPackage<T extends { price_krw: number }>(packages: T[], price: number): T | null {
  if (packages.length === 0) return null;
  return packages.reduce((best, p) =>
    Math.abs(p.price_krw - price) < Math.abs(best.price_krw - price) ? p : best
  );
}

// 분 → 사람이 읽기 쉬운 촬영시간 (60→"1시간", 90→"1시간 30분", 45→"45분")
function formatDuration(min: number): string {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

// 페이지별 동적 메타 — 사진의 무드·지역·가격으로 고유 제목/설명, OG 이미지는 그 사진.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const photo = await fetchPhotoById(id);
  return photo ? photoMetadata(photo) : {};
}

export default async function PhotoDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ like?: string; mock?: string }>;
}) {
  const { id } = await params;
  const showSearchUi = shouldShowSearchUi("photo");
  const searchPlaceholder = showSearchUi
    ? pickSearchPlaceholder(Number.parseInt(newFeedSeed(), 36) / 2 ** 31)
    : "";
  const sp = (await searchParams) ?? {};
  const photo = await fetchPhotoById(id);
  if (!photo) notFound();

  // 상단(즉시 노출)에 필요한 것만 병렬 조회. 추천(400장 조회+스코어링)은 첫 화면을
  // 막지 않도록 아래 <Suspense>에서 따로 스트리밍한다.
  const [ph, me, packages, guideImages] = await Promise.all([
    fetchPhotographerById(photo.photographer_id),
    getCurrentUser(),
    fetchPhotographerPackages(photo.photographer_id),
    fetchGuideImages(photo.photographer_id),
  ]);
  if (!ph) notFound();

  const isOwner = me?.photographer?.id === ph.id;
  const location = photo.location_text || photo.region || null;
  // 사진 가격은 작가 패키지 가격 중에서 선택되지만(포트폴리오 등록 UI) 이후 패키지 가격이 바뀌면
  // 정확히 안 맞을 수 있어, '가격이 가장 가까운' 활성 패키지를 기준으로 촬영시간·보정본을 노출.
  // (정확 일치 시 차=0이라 그 패키지, 작가에 활성 패키지가 없으면 null → 가격만)
  const matchedPkg = photo.price_krw != null ? nearestPackage(packages, photo.price_krw) : null;

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
      <JsonLd data={photoImageJsonLd(photo)} />
      <ScrollTop />
      <RememberFrameAspect id={photo.id} aspect={aspect} />
      {autoLike && <AutoFavorite targetType="photo" targetId={photo.id} path={`/photos/${photo.id}`} />}
      {/* Meta 픽셀 ViewContent — 작가명 노출 금지(content_name 익명) */}
      <PixelViewContent
        id={photo.id}
        photographerId={photo.photographer_id}
        albumId={photo.album_id}
        category={photo.mood_tags ?? null}
        region={photo.region ?? photo.location_text ?? null}
        price={photo.price_krw ?? null}
        disabled={isOwner}
      />
      {showSearchUi ? (
        <SearchDock placeholder={searchPlaceholder} variant="photo" />
      ) : null}
      {/*
        지면의 제목. 화면에서는 사진 자체가 제목이라 글씨를 얹지 않는다 —
        사진 위에 큰 글씨를 놓으면 그걸 읽히게 하려고 사진을 눌러야 한다.
        다만 문서에는 h1 이 있어야 한다. 이 지면엔 h2 만 둘 있고 h1 이 없었다.
        <title> 과 같은 함수(photoTitle)로 지어 이름이 어긋나지 않게 한다.
      */}
      <h1 className="sr-only">{photoTitle(photo)}</h1>

      <CaptionProvider caption={caption || albumDescription}>
      <div className="md:flex md:items-start md:gap-8">
        {/* 사진 — 화면 최상단. 공유·담기는 이미지 위 오버레이 */}
        {/* 사진 프레임 — 높이 상한은 globals.css 의 --photo-cap 한 곳에 있다
            (page · loading · carousel 이 같은 값을 써야 로딩 끝날 때 화면이 안 튄다) */}
        <div
          data-photo-frame
          className="photo-frame relative mx-auto md:mx-0 md:sticky md:top-4 md:shrink-0 md:self-start"
          style={{ "--ar": String(aspect) } as React.CSSProperties}
        >
          <PhotoCarousel photos={carousel} startIndex={startIndex} frameAspect={aspect} />
          {/* 작가의 글 — 버튼을 누르면 사진 위에 겹친다 */}
          <CaptionOverlay />
          {/* 좌상단 투명 뒤로가기 (담기·공유는 carousel 내부에서 사진 모서리에 붙음) */}
          <PhotoTopBar />
        </div>

        {/* 사진 정보 — 가격·CTA 먼저 보이고, 작가·글·태그는 접기 */}
        <div className="mt-4 md:mt-0 md:min-w-0 md:flex-1">
          {/* 공유·담기 + 파트너 뱃지 한 행 — 사진 바로 아래 첫 줄이다.
              뱃지를 따로 한 줄 내리면 "누가 찍는가" 가 CTA 뒤로 밀려 읽히지 않는다.
              (촬영시간·보정본·가격은 아래 패키지 정보 섹션에서만 — 중복 금지) */}
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
              <CaptionToggleButton />
            </div>
            {/* 오른쪽 끝 — 팝오버가 화면 밖으로 나가지 않게 정렬을 오른쪽 기준으로 */}
            {!isOwner && <PartnerBadge popoverAlign="right" />}
          </div>

          {/* 예약·상담 CTA — 가장 위 (전환 최우선) */}
          {isOwner ? (
            <div className="mt-4">
              <OwnerPhotoBackButton />
            </div>
          ) : (
            <PhotoCtas photographerId={ph.id} photoId={photo.id} isLoggedIn={!!me} />
          )}

          {/* 이 사진을 찍은 패키지 정보 — 접지 않고 바로 펼쳐서 보여준다 */}
          <PackageInfoSection
            name={matchedPkg?.name ?? null}
            description={matchedPkg?.description ?? null}
            price={photo.price_krw}
            duration={matchedPkg ? formatDuration(matchedPkg.duration_min) : null}
            editedCount={matchedPkg?.edited_count ?? null}
            location={location}
          />

          {/* 작가 안내 이미지 — 없으면 섹션째 렌더 안 됨 */}
          {guideImages.length > 0 && (
            <DetailSection title="작가님이 안내드리는 내용">
              <GuideImageGallery images={guideImages} />
            </DetailSection>
          )}

          {/* 작가 상세정보 라인 — 이 지점이 화면 상단 50%에 닿으면 플로팅 내비 노출 */}
          <NavRevealOnScroll />

          {/* 작가 프로필 — 누구에게 맡기는지 (작가의 글은 패키지 정보 안으로) */}
          <DetailSection title="작가 정보">
            <DetailMoreInfo photographerId={ph.id} avatarUrl={ph.avatar_url} />
          </DetailSection>
        </div>
      </div>
      </CaptionProvider>

      {/* 하단 — 추천 사진. Suspense 로 분리해 상단(사진·CTA)을 먼저 렌더하고 추천은 스트리밍.
          400장 조회+스코어링이 더 이상 첫 화면(LCP)을 막지 않는다.
          구분선 대신 섹션 제목으로 위 정보 영역과 탐색 그리드를 분리(제목은 스켈레톤·로드 공통 노출). */}
      <div className="mt-12 border-t border-line pt-6">
        <h2 className="mb-3 text-body font-bold tracking-tight text-fg">이런 사진은 어때요?</h2>
        <Suspense fallback={<RecsSkeleton />}>
          <Recommendations photoId={photo.id} albumId={photo.album_id} tags={photo.mood_tags ?? []} />
        </Suspense>
      </div>

      {/* A11 혜택 hook — 스크롤 내리면 노출, 예약/장바구니 1회 후 숨김 */}
    </main>
  );
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
  // 큐레이션 추천(유사도순 120장) 뒤로는 시드 피드를 무한 이어붙임(현재 사진 제외).
  return (
    <PhotoExplore
      initialRecs={recs.slice(0, 120)}
      feedSeed={newFeedSeed()}
      loadMore={loadMorePhotos}
      rerank={loadRankedDetailPhotos}
      excludeId={photoId}
    />
  );
}

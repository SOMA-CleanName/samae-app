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
import { startConversation } from "../../chat/actions";
import { PhotoCarousel } from "./PhotoCarousel";
import { PhotoExplore } from "./PhotoExplore";
import { PhotoTopBar } from "./PhotoTopBar";
import { AutoFavorite } from "@/components/user/AutoFavorite";
import { Avatar, Button } from "@/components/ui";

const fmt = new Intl.NumberFormat("ko-KR");

export default async function PhotoDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ like?: string }>;
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
          {/* 작가 — 별점·촬영가 제거, '작가 사진 보러가기'만 (§2-5) */}
          <Link
            href={`/photographers/${ph.id}`}
            className="flex items-center gap-3 rounded-2xl border border-line p-3 transition-colors hover:bg-surface-2"
          >
            <Avatar name={phName} size="md" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{phName}</span>
              <span className="block text-xs text-muted">작가 사진 보러가기 →</span>
            </span>
          </Link>

          {/* 무드 태그 — 이름 바로 아래, 빠르게 스캔 */}
          {photo.mood_tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {photo.mood_tags.map((m) => (
                <span key={m} className="rounded-full bg-fg/[0.06] px-2.5 py-1 text-xs text-fg/70">
                  #{m}
                </span>
              ))}
            </div>
          )}

          {/* 촬영 설명글 (피드 단위) */}
          {albumDescription && (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-fg/80">
              {albumDescription}
            </p>
          )}

          {/* 가격 — 강조(결정 정보), 장소는 보조 (장소 아이콘 제거 §2-6) */}
          <div className="mt-6">
            <p className="text-xs text-muted">가격</p>
            <p className="mt-0.5 text-2xl font-semibold tracking-tight">
              {photo.price_krw != null ? `₩${fmt.format(photo.price_krw)}` : "문의"}
            </p>
            {location && <p className="mt-1 text-sm text-muted">{location}</p>}
          </div>

          {/* 예약·문의 (좋아요는 캐러셀 위에 표시) */}
          <PhotoCtas isOwner={isOwner} me={!!me} photographerId={ph.id} photoId={photo.id} />
        </div>
      </div>

      {/* 2단계 상단바 — 항상 뒤로가기, 하단 그리드 노출 시 검색 등장 */}
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
      <Button href="/login" size="lg" fullWidth className="mt-6">
        로그인하고 예약·문의하기
      </Button>
    );
  }
  return (
    <form action={startConversation} className="mt-6">
      <input type="hidden" name="photographerId" value={photographerId} />
      <input type="hidden" name="photoId" value={photoId} />
      <Button type="submit" size="lg" fullWidth>
        예약·문의하기
      </Button>
    </form>
  );
}

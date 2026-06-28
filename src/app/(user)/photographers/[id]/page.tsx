import Link from "next/link";
import { notFound } from "next/navigation";
import {
  fetchPhotographerById,
  fetchPhotographerPhotos,
  fetchPhotographerPackages,
  fetchAlbumDescriptions,
} from "@/lib/discovery";
import { getCurrentUser } from "@/lib/auth";
import { fetchPhotographerHighlights } from "@/lib/highlights";
import { type PortfolioPost } from "./PortfolioGrid";
import { ProfileTabs } from "./ProfileTabs";
import { HighlightsBar } from "./HighlightsBar";
import { ProfileBackButton } from "./ProfileBackButton";
import { MapPinIcon } from "@/components/user/icons";
import { Avatar, Button } from "@/components/ui";

export default async function PhotographerProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ph = await fetchPhotographerById(id);
  if (!ph) notFound();

  const [photos, packages, highlights, me] = await Promise.all([
    fetchPhotographerPhotos(ph.id),
    fetchPhotographerPackages(ph.id),
    fetchPhotographerHighlights(ph.id),
    getCurrentUser(),
  ]);

  // 공개 사진 — 게시물(묶음) 단위로 묶기 (대표 1장 + 묶음 내 사진들)
  type ProfilePhoto = {
    id: string;
    src_url: string;
    thumb_url: string | null;
    price_krw: number | null;
    location_text: string | null;
    region: string | null;
    mood_tags: string[] | null;
    album_id: string | null;
  };
  const pubPhotos = photos as ProfilePhoto[];

  // 게시물(앨범) 설명글 — 포트폴리오 모달에 노출하려고 앨범id별로 일괄 조회
  const albumIds = [...new Set(pubPhotos.map((p) => p.album_id).filter((x): x is string => !!x))];
  const albumDescriptions = await fetchAlbumDescriptions(albumIds);

  const groups = new Map<string, PortfolioPost>();
  const order: string[] = [];
  for (const p of pubPhotos) {
    const key = p.album_id ?? `s-${p.id}`;
    const tile = { id: p.id, src_url: p.src_url, thumb_url: p.thumb_url };
    const g = groups.get(key);
    if (g) {
      g.count += 1;
      g.photos.push(tile);
    } else {
      groups.set(key, {
        key,
        coverId: p.id,
        cover_src: p.src_url,
        cover_thumb: p.thumb_url,
        price_krw: p.price_krw,
        location_text: p.location_text || p.region,
        mood_tags: p.mood_tags ?? [],
        description: p.album_id ? albumDescriptions[p.album_id] ?? null : null,
        count: 1,
        photos: [tile],
      });
      order.push(key);
    }
  }
  const posts = order.map((k) => groups.get(k)!);

  const fmt = new Intl.NumberFormat("ko-KR");
  const isOwner = me?.photographer?.id === ph.id;

  return (
    <main className="mx-auto max-w-6xl px-2.5 py-2.5 font-kr sm:px-4 sm:py-4">
      <ProfileBackButton />
      <div className="md:flex md:items-start md:gap-10">
        {/* 좌: 프로필 정보 (가로 레이아웃 — 데스크톱은 sticky 사이드바) */}
        <aside className="md:w-72 md:shrink-0 md:sticky md:top-6 md:self-start">
          <div className="flex items-center gap-4 md:flex-col md:items-start md:gap-0">
            <Avatar src={ph.avatar_url} name="사진작가" size="lg" className="shadow-lg ring-2 ring-white/40" />
            <div className="min-w-0 md:mt-4">
              {/* 작가 실명 노출 금지 — 별점/후기도 숨김(데이터·기능은 보존) */}
              <h1 className="text-h1 font-semibold">사진작가</h1>
              <p className="mt-1 text-body-sm text-muted">
                촬영 시작 <strong className="text-fg">₩{fmt.format(ph.price_from_krw)}</strong>
              </p>
            </div>
          </div>

          {ph.bio && <p className="mt-4 text-body leading-relaxed text-fg/80">{ph.bio}</p>}

          {/* 태그 */}
          {(ph.mood_tags?.length || ph.regions?.length) ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ph.regions?.map((r: string) => (
                <span key={r} className="inline-flex items-center gap-1 rounded-full bg-fg/[0.06] px-2.5 py-1 text-caption text-fg/70">
                  <MapPinIcon className="h-3 w-3 text-fg/45" />
                  {r}
                </span>
              ))}
              {ph.mood_tags?.map((m: string) => (
                <span key={m} className="rounded-full bg-fg/[0.06] px-2.5 py-1 text-caption text-fg/70">#{m}</span>
              ))}
            </div>
          ) : null}

          {/* 예약·문의 CTA */}
          <div className="mt-4">
            <ProfileCta isOwner={isOwner} me={!!me} photographerId={ph.id} />
          </div>
        </aside>

        {/* 우: 하이라이트(최상단) + 포트폴리오 / 촬영 패키지 탭 */}
        {/* min-h: 탭 전환 시 높이 급변으로 좌측 sticky 프로필이 튀는 것 방지.
            -mt-1.5(PC): 하이라이트 행 상단 패딩(py-1.5) 만큼 끌어올려 원-아바타 상단 정렬 */}
        <section className="mt-5 md:-mt-1.5 md:min-h-[70vh] md:min-w-0 md:flex-1">
          {highlights.length > 0 && (
            <div className="mb-3">
              <HighlightsBar
                highlights={highlights}
                cta={<ViewerCta isOwner={isOwner} me={!!me} photographerId={ph.id} />}
              />
            </div>
          )}
          <ProfileTabs
            posts={posts}
            packages={packages}
            viewer={{ isOwner, photographerId: ph.id }}
          />
        </section>
      </div>
    </main>
  );
}

// 스토리 뷰어용 CTA — 어두운 배경에 흰 버튼 (본인이면 표시 안 함)
function ViewerCta({
  isOwner,
  me,
  photographerId,
}: {
  isOwner: boolean;
  me: boolean;
  photographerId: string;
}) {
  if (isOwner) return null;
  if (!me) {
    return (
      <Link
        href={inquiryHref(photographerId)}
        className="block w-full rounded-full bg-fg py-3 text-center text-sm font-semibold text-bg hover:opacity-90"
      >
        예약·문의하기
      </Link>
    );
  }
  return (
    <Link
      href={inquiryHref(photographerId)}
      className="block w-full rounded-full bg-fg py-3 text-center text-sm font-semibold text-bg hover:opacity-90"
    >
      예약·문의하기
    </Link>
  );
}

// 작가 프로필 CTA — 본인/로그인/비로그인 분기 (데스크톱 사이드바 + 모바일 고정 바 공용)
function ProfileCta({
  isOwner,
  me,
  photographerId,
}: {
  isOwner: boolean;
  me: boolean;
  photographerId: string;
}) {
  if (isOwner) {
    return (
      <Button href="/studio" variant="secondary" size="lg" fullWidth>
        내 프로필입니다 — 스튜디오로
      </Button>
    );
  }
  // 주 전환 CTA — 브랜드 레드로 강조(로그인 여부 무관, /inquiry 에서 처리)
  if (!me) {
    return (
      <Button href={inquiryHref(photographerId)} variant="brand" size="lg" fullWidth>
        예약·문의하기
      </Button>
    );
  }
  return (
    <Button href={inquiryHref(photographerId)} variant="brand" size="lg" fullWidth data-track="cta:inquiry">
      예약·문의하기
    </Button>
  );
}

function inquiryHref(photographerId: string) {
  return `/inquiry?photographerId=${encodeURIComponent(photographerId)}`;
}

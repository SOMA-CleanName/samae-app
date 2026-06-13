import Link from "next/link";
import { notFound } from "next/navigation";
import {
  fetchPhotographerById,
  fetchPhotographerPhotos,
  fetchPhotographerPackages,
} from "@/lib/discovery";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchPhotographerHighlights } from "@/lib/highlights";
import { toggleFavorite } from "../../actions";
import { startConversation } from "../../chat/actions";
import { type PortfolioPost } from "./PortfolioGrid";
import { ProfileTabs } from "./ProfileTabs";
import { HighlightsBar } from "./HighlightsBar";
import { AutoFavorite } from "@/components/user/AutoFavorite";
import { HeartIcon, StarIcon, MapPinIcon } from "@/components/user/icons";
import { Avatar, Button } from "@/components/ui";
import { cn } from "@/lib/cn";

export default async function PhotographerProfile({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ fav?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
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
        count: 1,
        photos: [tile],
      });
      order.push(key);
    }
  }
  const posts = order.map((k) => groups.get(k)!);

  // 관심 작가 여부
  let favorited = false;
  if (me) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("favorites")
      .select("id")
      .eq("profile_id", me.id)
      .eq("target_type", "photographer")
      .eq("target_id", ph.id)
      .maybeSingle();
    favorited = !!data;
  }

  const fmt = new Intl.NumberFormat("ko-KR");
  const isOwner = me?.photographer?.id === ph.id;
  const phName = ph.display_name || "작가";

  // 로그인 복귀 후 의도했던 관심 작가 자동 적용 (아직 안 했고 본인 아님)
  const autoFav = sp.fav === "1" && !isOwner && !favorited;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 font-kr sm:px-6 md:pt-16 md:pb-12">
      {autoFav && (
        <AutoFavorite targetType="photographer" targetId={ph.id} path={`/photographers/${ph.id}`} />
      )}
      <div className="md:flex md:items-start md:gap-10">
        {/* 좌: 프로필 정보 (가로 레이아웃 — 데스크톱은 sticky 사이드바) */}
        <aside className="md:w-72 md:shrink-0 md:sticky md:top-6 md:self-start">
          <div className="flex items-center gap-4 md:flex-col md:items-start md:gap-0">
            <Avatar name={phName} size="xl" className="shadow-lg ring-2 ring-white/40" />
            <div className="min-w-0 md:mt-4">
              <h1 className="text-h1 font-semibold">{phName}</h1>
              {/* 지표 */}
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-body-sm text-muted">
                <span className="inline-flex items-center gap-1">
                  <StarIcon className="h-4 w-4 text-amber-500" />
                  <strong className="text-fg">{ph.rating_avg.toFixed(1)}</strong>
                  <span className="text-faint">({ph.review_count})</span>
                </span>
                <span className="text-faint">·</span>
                <span>작품 <strong className="text-fg">{photos.length}</strong></span>
              </div>
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

          {/* 예약·문의(좌) + 관심 작가(우) 나란히 — 프로필 정보 영역에 배치 (모바일·데스크톱 공용) */}
          <div className="mt-4">
            <ProfileActions
              isOwner={isOwner}
              me={!!me}
              photographerId={ph.id}
              favorited={favorited}
            />
          </div>
        </aside>

        {/* 우: 하이라이트(최상단) + 포트폴리오 / 촬영 패키지 탭 */}
        {/* min-h: 탭 전환 시 높이 급변으로 좌측 sticky 프로필이 튀는 것 방지.
            -mt-1.5(PC): 하이라이트 행 상단 패딩(py-1.5) 만큼 끌어올려 원-아바타 상단 정렬 */}
        <section className="mt-8 md:-mt-1.5 md:min-h-[70vh] md:min-w-0 md:flex-1">
          {highlights.length > 0 && (
            <div className="mb-6">
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
        href={`/login?next=/photographers/${photographerId}`}
        className="block w-full rounded-full bg-white py-3 text-center text-sm font-semibold text-black hover:opacity-90"
      >
        로그인하고 예약·문의하기
      </Link>
    );
  }
  return (
    <form action={startConversation}>
      <input type="hidden" name="photographerId" value={photographerId} />
      <button className="block w-full rounded-full bg-white py-3 text-center text-sm font-semibold text-black hover:opacity-90">
        예약·문의하기
      </button>
    </form>
  );
}

// 예약·문의(좌, 메인) + 관심 작가(우, 보조) 를 한 줄에 나란히. 데스크톱·모바일 공용.
function ProfileActions({
  isOwner,
  me,
  photographerId,
  favorited,
}: {
  isOwner: boolean;
  me: boolean;
  photographerId: string;
  favorited: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <ProfileCta isOwner={isOwner} me={me} photographerId={photographerId} />
      </div>
      {!isOwner && (
        <FavoriteButton favorited={favorited} photographerId={photographerId} />
      )}
    </div>
  );
}

// 관심 작가 토글 — 보조 버튼(하트). 예약·문의 우측에 컴팩트하게.
function FavoriteButton({
  favorited,
  photographerId,
}: {
  favorited: boolean;
  photographerId: string;
}) {
  return (
    <form action={toggleFavorite} className="shrink-0">
      <input type="hidden" name="targetType" value="photographer" />
      <input type="hidden" name="targetId" value={photographerId} />
      <input type="hidden" name="path" value={`/photographers/${photographerId}`} />
      {/* 비로그인 → 로그인 복귀 후 관심 작가 자동 적용 */}
      <input type="hidden" name="next" value={`/photographers/${photographerId}?fav=1`} />
      <button
        aria-pressed={favorited}
        aria-label={favorited ? "관심 작가 해제" : "관심 작가 추가"}
        className={cn(
          "flex h-12 cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-5 text-sm font-semibold transition-colors",
          favorited
            ? "border-brand bg-brand/[0.06] text-brand"
            : "border-line-strong text-fg/70 hover:bg-surface-2"
        )}
      >
        <HeartIcon className="h-5 w-5" filled={favorited} />
        <span className="hidden sm:inline">관심</span>
      </button>
    </form>
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
  if (!me) {
    return (
      <Button href={`/login?next=/photographers/${photographerId}`} size="lg" fullWidth>
        로그인하고 예약·문의하기
      </Button>
    );
  }
  return (
    <form action={startConversation}>
      <input type="hidden" name="photographerId" value={photographerId} />
      <Button type="submit" size="lg" fullWidth>
        예약·문의하기
      </Button>
    </form>
  );
}

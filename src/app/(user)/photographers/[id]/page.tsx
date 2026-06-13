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
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 pb-28 font-kr md:pb-12">
      {autoFav && (
        <AutoFavorite targetType="photographer" targetId={ph.id} path={`/photographers/${ph.id}`} />
      )}
      <div className="md:flex md:items-start md:gap-10">
        {/* 좌: 프로필 정보 (가로 레이아웃 — 데스크톱은 sticky 사이드바) */}
        <aside className="md:w-72 md:shrink-0 md:sticky md:top-20 md:self-start">
          <div className="flex items-center gap-4 md:flex-col md:items-start md:gap-0">
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-gradient-to-br from-rose-400 to-orange-400 text-2xl font-bold text-white shadow-lg ring-2 ring-white/40 md:h-24 md:w-24 md:text-3xl">
              {phName[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 md:mt-4">
              <h1 className="text-2xl font-semibold">{phName}</h1>
              {/* 지표 */}
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-fg/70">
                <span>
                  <span className="text-amber-500">★</span>{" "}
                  <strong>{ph.rating_avg.toFixed(1)}</strong>{" "}
                  <span className="text-fg/45">({ph.review_count})</span>
                </span>
                <span className="text-fg/25">·</span>
                <span>작품 <strong>{photos.length}</strong></span>
              </div>
              <p className="mt-1 text-sm text-fg/60">
                촬영 시작 <strong className="text-fg/80">₩{fmt.format(ph.price_from_krw)}</strong>
              </p>
            </div>
          </div>

          {ph.bio && <p className="mt-4 text-sm leading-relaxed text-fg/70">{ph.bio}</p>}

          {/* 태그 */}
          {(ph.mood_tags?.length || ph.regions?.length) ? (
            <div className="mt-3 flex flex-wrap gap-1">
              {ph.regions?.map((r: string) => (
                <span key={r} className="rounded-full bg-fg/[0.06] px-2.5 py-0.5 text-[11px] text-fg/70">📍 {r}</span>
              ))}
              {ph.mood_tags?.map((m: string) => (
                <span key={m} className="rounded-full bg-fg/[0.06] px-2.5 py-0.5 text-[11px] text-fg/70">#{m}</span>
              ))}
            </div>
          ) : null}

          {/* 관심 작가 추가하기 */}
          {!isOwner && (
            <form action={toggleFavorite} className="mt-4">
              <input type="hidden" name="targetType" value="photographer" />
              <input type="hidden" name="targetId" value={ph.id} />
              <input type="hidden" name="path" value={`/photographers/${ph.id}`} />
              {/* 비로그인 → 로그인 복귀 후 관심 작가 자동 적용 */}
              <input type="hidden" name="next" value={`/photographers/${ph.id}?fav=1`} />
              <button
                className={`w-full rounded-full border px-4 py-2 text-sm transition-colors ${
                  favorited
                    ? "border-brand bg-brand/[0.06] text-brand"
                    : "border-fg/20 text-fg/70 hover:bg-fg/[0.04]"
                }`}
              >
                {favorited ? "♥ 관심 작가" : "♡ 관심 작가 추가하기"}
              </button>
            </form>
          )}

          {/* 데스크톱 인라인 CTA (모바일은 하단 고정 바) */}
          <div className="mt-3 hidden md:block">
            <ProfileCta isOwner={isOwner} me={!!me} photographerId={ph.id} />
          </div>
        </aside>

        {/* 우: 하이라이트(최상단) + 포트폴리오 / 촬영 패키지 탭 */}
        <section className="mt-8 md:mt-0 md:min-w-0 md:flex-1">
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

      {/* 하단 고정 CTA — 모바일 전용 */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-fg/8 bg-bg/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur md:hidden">
        <div className="mx-auto max-w-md">
          <ProfileCta isOwner={isOwner} me={!!me} photographerId={ph.id} />
        </div>
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
      <Link
        href="/studio"
        className="block w-full rounded-full bg-fg/[0.06] py-3.5 text-center text-sm font-semibold text-fg/70"
      >
        내 프로필입니다 — 스튜디오로
      </Link>
    );
  }
  if (!me) {
    return (
      <Link
        href={`/login?next=/photographers/${photographerId}`}
        className="block w-full rounded-full bg-fg py-3.5 text-center text-sm font-semibold text-bg hover:opacity-90"
      >
        로그인하고 예약·문의하기
      </Link>
    );
  }
  return (
    <form action={startConversation}>
      <input type="hidden" name="photographerId" value={photographerId} />
      <button className="block w-full rounded-full bg-fg py-3.5 text-center text-sm font-semibold text-bg hover:opacity-90">
        예약·문의하기
      </button>
    </form>
  );
}

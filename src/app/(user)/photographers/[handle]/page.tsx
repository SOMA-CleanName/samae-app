/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  fetchPhotographerByHandle,
  fetchPhotographerPhotos,
  fetchPhotographerPackages,
} from "@/lib/discovery";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toggleFavorite } from "../../actions";
import { startConversation } from "../../chat/actions";

export default async function PhotographerProfile({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const ph = await fetchPhotographerByHandle(handle);
  if (!ph) notFound();

  const [photos, packages, me] = await Promise.all([
    fetchPhotographerPhotos(ph.id),
    fetchPhotographerPackages(ph.id),
    getCurrentUser(),
  ]);

  // 찜 여부
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

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 pt-8 pb-28 font-kr">
      {/* 헤더 */}
      <div className="flex flex-col items-center text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-orange-400 text-3xl font-bold text-white shadow-lg ring-2 ring-white/40">
          {(ph.display_name || ph.handle)[0]?.toUpperCase()}
        </div>
        <h1 className="mt-4 text-2xl font-semibold">
          {ph.display_name || `@${ph.handle}`}
        </h1>
        {ph.display_name && <p className="mt-0.5 text-xs text-fg/55">@{ph.handle}</p>}
        {ph.bio && <p className="mt-2 max-w-md text-sm text-fg/70">{ph.bio}</p>}

        {/* 태그 */}
        {(ph.mood_tags?.length || ph.regions?.length) ? (
          <div className="mt-3 flex flex-wrap justify-center gap-1">
            {ph.regions?.map((r: string) => (
              <span key={r} className="rounded-full bg-fg/[0.06] px-2.5 py-0.5 text-[11px] text-fg/70">📍 {r}</span>
            ))}
            {ph.mood_tags?.map((m: string) => (
              <span key={m} className="rounded-full bg-fg/[0.06] px-2.5 py-0.5 text-[11px] text-fg/70">#{m}</span>
            ))}
          </div>
        ) : null}

        {/* 지표 */}
        <div className="mt-4 flex items-center gap-3 text-sm text-fg/70">
          <span><span className="text-amber-500">★</span> <strong>{ph.rating_avg.toFixed(1)}</strong> <span className="text-fg/45">({ph.review_count})</span></span>
          <span className="text-fg/25">·</span>
          <span>작품 <strong>{photos.length}</strong></span>
          <span className="text-fg/25">·</span>
          <span>촬영 시작 <strong>₩{fmt.format(ph.price_from_krw)}</strong></span>
        </div>

        {/* 찜 버튼 */}
        <form action={toggleFavorite} className="mt-4">
          <input type="hidden" name="targetType" value="photographer" />
          <input type="hidden" name="targetId" value={ph.id} />
          <input type="hidden" name="handle" value={ph.handle} />
          <button
            className={`rounded-full border px-4 py-1.5 text-sm ${
              favorited
                ? "border-brand bg-brand/[0.06] text-brand"
                : "border-fg/20 text-fg/70 hover:bg-fg/[0.04]"
            }`}
          >
            {favorited ? "♥ 찜됨" : "♡ 찜하기"}
          </button>
        </form>
      </div>

      {/* 패키지 */}
      {packages.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-medium text-fg/70">촬영 패키지</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {packages.map((pkg) => (
              <li key={pkg.id} className="rounded-xl border border-fg/10 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold">{pkg.name}</p>
                  <p className="shrink-0 text-sm font-semibold">₩{fmt.format(pkg.price_krw)}</p>
                </div>
                {pkg.description && <p className="mt-1 text-sm text-fg/60">{pkg.description}</p>}
                <p className="mt-1 text-xs text-fg/45">
                  {pkg.duration_min}분 · 보정본 {pkg.edited_count}장
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 포트폴리오 */}
      <section className="mt-10">
        <h2 className="text-sm font-medium text-fg/70">포트폴리오</h2>
        {photos.length === 0 ? (
          <p className="mt-3 text-sm text-fg/45">아직 등록된 작품이 없어요.</p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-1 sm:gap-1.5">
            {photos.map((p) => (
              <div key={p.id} className="aspect-square overflow-hidden rounded bg-fg/[0.05]">
                <img src={p.thumb_url ?? p.src_url} alt="" loading="lazy" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 하단 고정 CTA — 채팅(3단계에서 연결) */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-fg/8 bg-bg/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur">
        <div className="mx-auto max-w-md">
          {me && me.photographer?.id === ph.id ? (
            <Link
              href="/studio"
              className="block w-full rounded-full bg-fg/[0.06] py-3.5 text-center text-sm font-semibold text-fg/70"
            >
              내 프로필입니다 — 스튜디오로
            </Link>
          ) : me ? (
            <form action={startConversation}>
              <input type="hidden" name="photographerId" value={ph.id} />
              <button className="w-full rounded-full bg-fg py-3.5 text-sm font-semibold text-bg hover:opacity-90">
                작가에게 채팅 문의
              </button>
            </form>
          ) : (
            <Link
              href={`/login?next=/photographers/${ph.handle}`}
              className="block w-full rounded-full bg-fg py-3.5 text-center text-sm font-semibold text-bg hover:opacity-90"
            >
              로그인하고 문의하기
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

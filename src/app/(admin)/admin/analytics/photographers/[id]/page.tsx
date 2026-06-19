import Link from "next/link";
import { AnalyticsChrome } from "../../AnalyticsChrome";
import { EmptyHint } from "../../_ui";
import { PhotoInsights, type PhotoStat } from "../../PhotoInsights";
import { loadAnalytics, fmt, matchPhoto, matchPhotographer, buildQs } from "../../_data";

export const dynamic = "force-dynamic";

export default async function PhotographerDrillPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ range?: string; seg?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const data = await loadAnalytics(sp.range, sp.seg);
  const { sessions, photoMeta, pgName, range, seg } = data;
  const qs = buildQs(range.key, seg.key);

  const name = pgName.get(id) ?? "이름 미상 작가";

  // 이 작가의 프로필 조회 + 사진별 클릭·조회
  let profileViews = 0;
  const clicks = new Map<string, number>();
  const views = new Map<string, number>();
  for (const s of sessions)
    for (const e of s.events) {
      if (e.type === "pageview") {
        if (matchPhotographer(e.path) === id) profileViews += 1;
        const ph = matchPhoto(e.path);
        if (ph && photoMeta.get(ph)?.pgId === id) views.set(ph, (views.get(ph) ?? 0) + 1);
      } else if (e.type === "click") {
        const ph = matchPhoto(e.target ?? "");
        if (ph && photoMeta.get(ph)?.pgId === id) clicks.set(ph, (clicks.get(ph) ?? 0) + 1);
      }
    }

  const ids = new Set<string>([...clicks.keys(), ...views.keys()]);
  const photos: PhotoStat[] = [...ids]
    .map((pid): PhotoStat | null => {
      const m = photoMeta.get(pid);
      if (!m || (!m.thumb && !m.src)) return null;
      return { id: pid, count: clicks.get(pid) ?? 0, views: views.get(pid) ?? 0, ...m };
    })
    .filter((x): x is PhotoStat => !!x)
    .sort((a, b) => b.count - a.count || (b.views ?? 0) - (a.views ?? 0));

  const totalClicks = [...clicks.values()].reduce((n, v) => n + v, 0);
  const totalViews = [...views.values()].reduce((n, v) => n + v, 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <AnalyticsChrome active="photographers" data={data} />

      <div className="mt-6">
        <Link
          href={`/admin/analytics/photographers${qs}`}
          className="inline-flex items-center gap-1 text-caption text-muted transition-colors hover:text-fg"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          작가별 목록으로
        </Link>
        <h2 className="mt-2 text-h2 font-semibold text-fg">{name}</h2>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-muted">
          <span>프로필 조회 <b className="tabular-nums text-fg">{fmt.format(profileViews)}</b></span>
          <span>사진 클릭 합계 <b className="tabular-nums text-fg">{fmt.format(totalClicks)}</b></span>
          <span>사진 조회 합계 <b className="tabular-nums text-fg">{fmt.format(totalViews)}</b></span>
        </p>
      </div>

      <h3 className="mb-3 mt-7 text-body-sm font-medium text-muted">사진별 클릭·조회</h3>
      {photos.length === 0 ? (
        <EmptyHint>이 작가의 사진에 대한 방문 기록이 아직 없어요.</EmptyHint>
      ) : (
        <PhotoInsights photos={photos} totalClicks={totalClicks} />
      )}
    </main>
  );
}

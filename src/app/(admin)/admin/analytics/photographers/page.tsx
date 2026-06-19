import Link from "next/link";
import { AnalyticsChrome } from "../AnalyticsChrome";
import { PageHeading, EmptyHint } from "../_ui";
import { loadAnalytics, fmt, matchPhoto, matchPhotographer, buildQs } from "../_data";

export const dynamic = "force-dynamic";

export default async function AnalyticsPhotographersPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string; seg?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const data = await loadAnalytics(sp.range, sp.seg);
  const { sessions, photoMeta, pgName, range, seg } = data;
  const qs = buildQs(range.key, seg.key);

  type Agg = {
    profileViews: number;
    photoClicks: number;
    photoViews: number;
    cover: string | null;
    coverClicks: number;
  };
  const agg = new Map<string, Agg>();
  const ensure = (id: string) => {
    let a = agg.get(id);
    if (!a) {
      a = { profileViews: 0, photoClicks: 0, photoViews: 0, cover: null, coverClicks: 0 };
      agg.set(id, a);
    }
    return a;
  };
  // 사진별 클릭 수(대표 썸네일 선정용)
  const photoClickCount = new Map<string, number>();

  for (const s of sessions)
    for (const e of s.events) {
      if (e.type === "pageview") {
        const pg = matchPhotographer(e.path);
        if (pg) {
          ensure(pg).profileViews += 1;
          continue;
        }
        const ph = matchPhoto(e.path);
        if (ph) {
          const pgId = photoMeta.get(ph)?.pgId;
          if (pgId) ensure(pgId).photoViews += 1;
        }
      } else if (e.type === "click") {
        const ph = matchPhoto(e.target ?? "");
        if (ph) {
          const meta = photoMeta.get(ph);
          const pgId = meta?.pgId;
          if (pgId) {
            const a = ensure(pgId);
            a.photoClicks += 1;
            const c = (photoClickCount.get(ph) ?? 0) + 1;
            photoClickCount.set(ph, c);
            if (c > a.coverClicks && (meta?.thumb || meta?.src)) {
              a.coverClicks = c;
              a.cover = meta.thumb || meta.src;
            }
          }
        }
      }
    }

  const rows = [...agg.entries()]
    .map(([id, a]) => ({
      id,
      name: pgName.get(id) ?? "이름 미상 작가",
      ...a,
      score: a.profileViews + a.photoClicks + a.photoViews,
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <AnalyticsChrome active="photographers" data={data} />
      <PageHeading
        title="작가별 인기"
        caption="손님 관심이 많은 작가 순서예요. 작가를 누르면 그 작가의 사진별 클릭·조회를 볼 수 있어요."
      />
      {rows.length === 0 ? (
        <EmptyHint>아직 작가 관련 방문 기록이 없어요.</EmptyHint>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r, i) => (
            <li key={r.id}>
              <Link
                href={`/admin/analytics/photographers/${r.id}${qs}`}
                className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition-colors hover:border-line-strong hover:bg-fg/[0.02]"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-fg/[0.05] text-caption font-bold tabular-nums text-fg">
                  {i + 1}
                </span>
                <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                  {r.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.cover} alt={r.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-caption text-faint">없음</span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-semibold text-fg">{r.name}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-muted">
                    <span>프로필 조회 <b className="tabular-nums text-fg">{fmt.format(r.profileViews)}</b></span>
                    <span>사진 클릭 <b className="tabular-nums text-fg">{fmt.format(r.photoClicks)}</b></span>
                    <span>사진 조회 <b className="tabular-nums text-fg">{fmt.format(r.photoViews)}</b></span>
                  </p>
                </div>
                <span className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

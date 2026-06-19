import { AnalyticsChrome } from "../AnalyticsChrome";
import { PageHeading, EmptyHint } from "../_ui";
import { loadAnalytics, fmt, fmtDuration, ctaName } from "../_data";

export const dynamic = "force-dynamic";

export default async function AnalyticsPagesPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string; seg?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const data = await loadAnalytics(sp.range, sp.seg);
  const { sessions, pageName } = data;

  type PageAgg = { views: number; exits: number; dwellSum: number; dwellCnt: number; clicks: Map<string, number> };
  const agg = new Map<string, PageAgg>();
  const ensure = (p: string) => {
    let a = agg.get(p);
    if (!a) {
      a = { views: 0, exits: 0, dwellSum: 0, dwellCnt: 0, clicks: new Map() };
      agg.set(p, a);
    }
    return a;
  };
  for (const s of sessions) {
    const evs = s.events;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (e.type === "pageview") {
        const a = ensure(e.path);
        a.views += 1;
        const start = Date.parse(e.created_at);
        let end = start;
        for (let j = i + 1; j < evs.length; j++) {
          end = Date.parse(evs[j].created_at);
          if (evs[j].type === "pageview") break;
        }
        const d = (end - start) / 1000;
        if (d > 0 && d < 1800) {
          a.dwellSum += d;
          a.dwellCnt += 1;
        }
      } else if (e.type === "click") {
        const a = ensure(e.path);
        const k = ctaName(e.label, e.target);
        a.clicks.set(k, (a.clicks.get(k) ?? 0) + 1);
      }
    }
    if (s.lastPath) ensure(s.lastPath).exits += 1;
  }
  const rows = [...agg.entries()]
    .map(([path, a]) => ({
      path,
      ...pageName(path),
      views: a.views,
      exits: a.exits,
      dwellAvg: a.dwellCnt > 0 ? a.dwellSum / a.dwellCnt : 0,
      clicks: [...a.clicks.entries()].sort((x, y) => y[1] - x[1]),
    }))
    .filter((p) => p.views > 0)
    .sort((a, b) => b.views - a.views);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <AnalyticsChrome active="pages" data={data} />
      <PageHeading
        title="페이지별 현황"
        caption="페이지마다 방문 수·평균 체류시간·여기서 떠난 사람과, 그 페이지에서 누른 버튼을 보여줘요."
      />
      {rows.length === 0 ? (
        <EmptyHint>아직 방문 기록이 없어요.</EmptyHint>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.map((p) => (
            <div key={p.path} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-body-sm font-semibold text-fg">{p.title}</p>
                  {p.sub && <p className="truncate text-caption text-muted">{p.sub}</p>}
                </div>
                <span className="shrink-0 rounded-lg bg-fg/[0.05] px-2 py-1 text-caption font-bold tabular-nums text-fg">
                  {fmt.format(p.views)} 방문
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-caption">
                <div className="rounded-lg bg-fg/[0.03] px-2.5 py-2">
                  <span className="block text-faint">평균 체류</span>
                  <span className="font-semibold text-fg">{fmtDuration(p.dwellAvg)}</span>
                </div>
                <div className="rounded-lg bg-fg/[0.03] px-2.5 py-2">
                  <span className="block text-faint">여기서 떠난 사람</span>
                  <span className="font-semibold text-fg">{fmt.format(p.exits)}명</span>
                </div>
              </div>
              <div className="mt-3">
                <p className="text-caption text-faint">여기서 누른 버튼</p>
                {p.clicks.length === 0 ? (
                  <p className="mt-1 text-caption text-muted">클릭 없음</p>
                ) : (
                  <ul className="mt-1.5 space-y-1.5">
                    {p.clicks.slice(0, 8).map(([k, n]) => (
                      <li key={k} className="flex items-center justify-between gap-2 text-caption">
                        <span className="min-w-0 flex-1 truncate text-fg">{k}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-muted">{fmt.format(n)}회</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

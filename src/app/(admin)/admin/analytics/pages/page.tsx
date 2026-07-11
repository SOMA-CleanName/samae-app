import Link from "next/link";
import { AnalyticsChrome } from "../AnalyticsChrome";
import { PageHeading, EmptyHint } from "../_ui";
import { loadAnalytics, fmt, fmtDuration, ctaName, matchPhoto, matchPhotographer, buildQs } from "../_data";

export const dynamic = "force-dynamic";

// 개별 사진/작가/카테고리 경로를 '타입' 한 줄로 통일 → 페이지별 목록이 폭발하지 않게.
// 정적 페이지(메인·로그인 등)는 경로 그대로 한 줄.
function groupKey(path: string): string {
  if (matchPhoto(path)) return "__photos__";
  if (matchPhotographer(path)) return "__photographers__";
  if (/^\/c\//.test(path)) return "__category__";
  // 단건 문의는 사진 id 별로 경로가 달라 폭발 → 하나로 묶음(장바구니·채팅은 단일 경로라 그대로)
  if (/^\/inquiry\/photo\//.test(path)) return "/inquiry/photo";
  return path;
}

export default async function AnalyticsPagesPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string; seg?: string; persona?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const data = await loadAnalytics(sp.range, sp.seg, sp.persona);
  const { sessions, pageName, range, seg, persona } = data;
  const qs = buildQs(range.key, seg.key, persona.key);

  type PageAgg = { views: number; exits: number; dwellSum: number; dwellCnt: number; clicks: Map<string, number>; uniq: Set<string> };
  const agg = new Map<string, PageAgg>();
  const ensure = (key: string) => {
    let a = agg.get(key);
    if (!a) {
      a = { views: 0, exits: 0, dwellSum: 0, dwellCnt: 0, clicks: new Map(), uniq: new Set() };
      agg.set(key, a);
    }
    return a;
  };
  for (const s of sessions) {
    const evs = s.events;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (e.type === "pageview") {
        const a = ensure(groupKey(e.path));
        a.views += 1;
        a.uniq.add(e.path);
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
        const a = ensure(groupKey(e.path));
        const k = ctaName(e.label, e.target);
        a.clicks.set(k, (a.clicks.get(k) ?? 0) + 1);
      }
    }
    if (s.lastPath) ensure(groupKey(s.lastPath)).exits += 1;
  }

  // 통일 행 표시 이름 + 작가별 탭으로 이동(개별 상세) 여부
  function groupTitle(key: string, uniq: number): { title: string; sub?: string; drill?: boolean } {
    if (key === "__photos__") return { title: "사진 상세페이지", sub: `개별 사진 ${fmt.format(uniq)}개 합계`, drill: true };
    if (key === "__photographers__") return { title: "작가 프로필", sub: `개별 작가 ${fmt.format(uniq)}명 합계`, drill: true };
    if (key === "__category__") return { title: "카테고리 페이지", sub: `${fmt.format(uniq)}개 카테고리 합계` };
    return pageName(key);
  }

  const rows = [...agg.entries()]
    .map(([key, a]) => ({
      key,
      ...groupTitle(key, a.uniq.size),
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
            <div key={p.key} className="rounded-2xl border border-line bg-surface p-4">
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
                <p className="text-caption text-faint">여기서 누른 버튼 (전체 합계)</p>
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
              {p.drill && (
                <Link
                  href={`/admin/analytics/photographers${qs}`}
                  className="mt-3 flex items-center justify-center gap-1 rounded-lg border border-line-strong px-3 py-2 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.03] hover:text-fg"
                >
                  작가별·사진별 자세히 보기
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

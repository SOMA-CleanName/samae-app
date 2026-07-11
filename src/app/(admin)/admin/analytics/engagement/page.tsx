import { AnalyticsChrome } from "../AnalyticsChrome";
import { PageHeading } from "../_ui";
import { loadAnalytics, fmt } from "../_data";

export const dynamic = "force-dynamic";

export default async function AnalyticsEngagementPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string; seg?: string; persona?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const data = await loadAnalytics(sp.range, sp.seg, sp.persona);
  const { sessions } = data;

  // 스크롤 깊이 — '화면 수'(뷰포트 단위)로 기록됨. 무한스크롤 페이지별로 따로 집계.
  const SCREEN_PHOTOS = 5; // 한 화면 ≈ 사진 장수(탐색 메이슨리 대략) — 환산 표기용
  function pageTypeOf(path: string): string | null {
    if (path === "/") return "메인페이지";
    if (/^\/photos\//.test(path)) return "사진 상세 (하단 추천)";
    if (/^\/c\//.test(path)) return "카테고리";
    return null; // 그 외 페이지의 스크롤은 관심 밖
  }
  const scrollByType = new Map<string, number[]>();
  for (const s of sessions)
    for (const e of s.events) {
      if (e.type !== "scroll") continue;
      const t = pageTypeOf(e.path);
      const n = Number(e.label);
      if (!t || !Number.isFinite(n)) continue;
      (scrollByType.get(t) ?? scrollByType.set(t, []).get(t)!).push(n);
    }
  const ORDER = ["메인페이지", "사진 상세 (하단 추천)", "카테고리"];
  function depthBuckets(vals: number[]): [string, number][] {
    const b = (lo: number, hi: number) => vals.filter((v) => v >= lo && v <= hi).length;
    return [
      ["거의 안 내림 (1화면)", b(1, 1)],
      ["조금 내림 (2~3화면)", b(2, 3)],
      ["꽤 내림 (4~6화면)", b(4, 6)],
      ["깊게 탐색 (7화면+)", b(7, Infinity)],
    ];
  }
  const scrollCards = [...scrollByType.entries()]
    .sort((a, b) => (ORDER.indexOf(a[0]) + 99) % 100 - ((ORDER.indexOf(b[0]) + 99) % 100))
    .map(([type, vals]) => {
      const avg = vals.reduce((n, v) => n + v, 0) / vals.length;
      return { type, count: vals.length, avg, approxPhotos: Math.round(avg * SCREEN_PHOTOS), rows: depthBuckets(vals) };
    });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <AnalyticsChrome active="engagement" data={data} />
      <PageHeading
        title="사진을 얼마나 깊이 봤나"
        caption="무한스크롤을 어디까지 내려봤는지 — 메인·사진 상세 하단 추천·카테고리 랜딩별로. (유입·광고 분석은 '광고·유입' 탭)"
      />

      <h3 className="text-body-sm font-medium text-muted">사진을 얼마나 내려봤나 (무한스크롤 깊이)</h3>
      <p className="mb-3 mt-1 text-caption text-faint">
        한 번에 보이는 화면(폰 한 화면)을 1화면으로 셉니다. 한 화면에 사진 약 {SCREEN_PHOTOS}장이 지나가요. 메인·사진 상세 하단 추천·카테고리의 무한스크롤을 각각 따로 집계해요.
      </p>
      {scrollCards.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong bg-surface px-4 py-8 text-center text-caption text-faint">
          아직 스크롤 기록이 없어요. (스크롤 깊이 저장에는 마이그레이션 0045 적용 필요)
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {scrollCards.map((c) => (
            <div key={c.type} className="rounded-2xl border border-line bg-surface p-4">
              <h4 className="text-body-sm font-semibold text-fg">{c.type}</h4>
              <p className="mt-0.5 text-caption text-muted">
                평균 <b className="tabular-nums text-fg">{c.avg.toFixed(1)}화면</b>
                <span className="text-faint"> ≈ 약 {fmt.format(c.approxPhotos)}장</span> · {fmt.format(c.count)}회 방문
              </p>
              <ul className="mt-3 space-y-2">
                {c.rows.map(([k, n]) => {
                  const pct = c.count > 0 ? Math.round((n / c.count) * 100) : 0;
                  return (
                    <li key={k}>
                      <div className="flex items-center justify-between gap-2 text-caption">
                        <span className="min-w-0 flex-1 truncate text-fg">{k}</span>
                        <span className="shrink-0 text-muted"><b className="text-fg tabular-nums">{fmt.format(n)}</b> · {pct}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-fg/[0.06]">
                        <div className="h-full rounded-full bg-fg/30" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

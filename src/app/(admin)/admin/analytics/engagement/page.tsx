import { AnalyticsChrome } from "../AnalyticsChrome";
import { PageHeading, RankCard } from "../_ui";
import { loadAnalytics, type Ev } from "../_data";

export const dynamic = "force-dynamic";

export default async function AnalyticsEngagementPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string; seg?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const data = await loadAnalytics(sp.range, sp.seg);
  const { sessions } = data;
  const sessionCount = sessions.length;
  const totalPageviews = sessions.reduce((n, s) => n + s.pageviews, 0);

  // 스크롤 깊이
  const scrollEvents = sessions.flatMap((s) => s.events).filter((e) => e.type === "scroll");
  const reach = (min: number) => scrollEvents.filter((e) => Number(e.label) >= min).length;
  const scrollRows: [string, number][] = [
    ["조금 봄 (25%+)", reach(25)],
    ["절반 봄 (50%+)", reach(50)],
    ["많이 봄 (75%+)", reach(75)],
    ["끝까지 봄 (100%)", reach(100)],
  ];

  // 보기 옵션 토글
  const clickEvents = sessions.flatMap((s) => s.events).filter((e) => e.type === "click");
  const optionRows: [string, number][] = [
    ["가격 표시 켜기/끄기", clickEvents.filter((e) => e.label === "toggle:price").length],
    ["작가명 표시 켜기/끄기", clickEvents.filter((e) => e.label === "toggle:name").length],
  ];

  // 광고 유입
  const utmCount = (pick: (e: Ev) => string | null) => {
    const c = new Map<string, number>();
    for (const s of sessions) for (const e of s.events) {
      if (e.type !== "pageview") continue;
      const k = pick(e);
      if (k) c.set(k, (c.get(k) ?? 0) + 1);
    }
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  };
  const topSources = utmCount((e) => e.utm_source);
  const topCampaigns = utmCount((e) => e.utm_campaign);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <AnalyticsChrome active="engagement" data={data} />
      <PageHeading
        title="얼마나 깊이 봤나 · 어디서 들어왔나"
        caption="사진을 끝까지 내려봤는지, 가격·작가명 표시를 켜봤는지, 어떤 광고로 들어왔는지."
      />

      <h3 className="mb-3 text-body-sm font-medium text-muted">참여</h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <RankCard title="사진을 어디까지 내려봤나 (스크롤)" rows={scrollRows} total={reach(25)} />
        <RankCard title="보기 옵션 사용 (가격/작가명 표시)" rows={optionRows} total={sessionCount} />
      </div>

      {(topSources.length > 0 || topCampaigns.length > 0) && (
        <>
          <h3 className="mb-3 mt-8 text-body-sm font-medium text-muted">광고 유입</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <RankCard title="유입 소스" rows={topSources} total={totalPageviews} />
            <RankCard title="캠페인" rows={topCampaigns} total={totalPageviews} />
          </div>
        </>
      )}
    </main>
  );
}

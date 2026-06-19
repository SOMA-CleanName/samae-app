import { AnalyticsChrome } from "../AnalyticsChrome";
import { PageHeading, EmptyHint } from "../_ui";
import { PhotoInsights, type PhotoStat } from "../PhotoInsights";
import { loadAnalytics, matchPhoto } from "../_data";

export const dynamic = "force-dynamic";

export default async function AnalyticsPhotosPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string; seg?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const data = await loadAnalytics(sp.range, sp.seg);
  const { sessions, photoMeta } = data;

  const photoClicks = new Map<string, number>();
  for (const s of sessions)
    for (const e of s.events) {
      if (e.type !== "click") continue;
      const id = matchPhoto(e.target ?? "");
      if (id) photoClicks.set(id, (photoClicks.get(id) ?? 0) + 1);
    }
  const total = [...photoClicks.values()].reduce((n, v) => n + v, 0);
  const photos: PhotoStat[] = [...photoClicks.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 48)
    .map(([id, count]): PhotoStat | null => {
      const m = photoMeta.get(id);
      if (!m || (!m.thumb && !m.src)) return null;
      return { id, count, ...m };
    })
    .filter((x): x is PhotoStat => !!x);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <AnalyticsChrome active="photos" data={data} />
      <PageHeading
        title="가장 많이 클릭된 사진"
        caption="손님들이 누른 실제 사진이에요. 사진을 누르면 작가·가격·지역 등 자세히 볼 수 있어요."
      />
      {photos.length === 0 ? (
        <EmptyHint>아직 클릭된 사진이 없어요. 방문자가 사진을 누르면 여기에 표시돼요.</EmptyHint>
      ) : (
        <PhotoInsights photos={photos} totalClicks={total} />
      )}
    </main>
  );
}

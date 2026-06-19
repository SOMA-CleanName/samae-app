import Link from "next/link";
import { AnalyticsChrome } from "../../AnalyticsChrome";
import { EmptyHint } from "../../_ui";
import { PhotoInsights, type PhotoStat } from "../../PhotoInsights";
import { loadAnalytics, fmt, ctaName, matchPhoto, matchPhotographer, buildQs } from "../../_data";

export const dynamic = "force-dynamic";

export default async function PhotographerDrillPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ range?: string; seg?: string; persona?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const data = await loadAnalytics(sp.range, sp.seg, sp.persona);
  const { sessions, photoMeta, pgName, range, seg, persona } = data;
  const qs = buildQs(range.key, seg.key, persona.key);

  const name = pgName.get(id) ?? "이름 미상 작가";

  // 이 작가의 프로필 조회 + 프로필 페이지 CTA + 사진별 클릭·조회·사진 페이지 CTA
  let profileViews = 0;
  const profileCtas = new Map<string, number>(); // 작가 프로필 페이지에서 누른 버튼
  const clicks = new Map<string, number>(); // 사진 카드 클릭(타깃 = 사진)
  const views = new Map<string, number>(); // 사진 상세 조회
  const photoCtas = new Map<string, Map<string, number>>(); // 사진 페이지에서 누른 버튼
  for (const s of sessions)
    for (const e of s.events) {
      if (e.type === "pageview") {
        if (matchPhotographer(e.path) === id) profileViews += 1;
        const ph = matchPhoto(e.path);
        if (ph && photoMeta.get(ph)?.pgId === id) views.set(ph, (views.get(ph) ?? 0) + 1);
      } else if (e.type === "click") {
        // 사진 카드 클릭 (어디선가 이 작가 사진으로 이동)
        const tgt = matchPhoto(e.target ?? "");
        if (tgt && photoMeta.get(tgt)?.pgId === id) clicks.set(tgt, (clicks.get(tgt) ?? 0) + 1);
        // 이 작가의 프로필 페이지에서 누른 버튼
        if (matchPhotographer(e.path) === id) {
          const k = ctaName(e.label, e.target);
          profileCtas.set(k, (profileCtas.get(k) ?? 0) + 1);
        }
        // 이 작가의 사진 페이지에서 누른 버튼
        const onPhoto = matchPhoto(e.path);
        if (onPhoto && photoMeta.get(onPhoto)?.pgId === id) {
          const m = photoCtas.get(onPhoto) ?? new Map<string, number>();
          const k = ctaName(e.label, e.target);
          m.set(k, (m.get(k) ?? 0) + 1);
          photoCtas.set(onPhoto, m);
        }
      }
    }

  const ids = new Set<string>([...clicks.keys(), ...views.keys(), ...photoCtas.keys()]);
  const photos: PhotoStat[] = [...ids]
    .map((pid): PhotoStat | null => {
      const m = photoMeta.get(pid);
      if (!m || (!m.thumb && !m.src)) return null;
      const cm = photoCtas.get(pid);
      return {
        id: pid,
        count: clicks.get(pid) ?? 0,
        views: views.get(pid) ?? 0,
        ctas: cm ? [...cm.entries()].sort((a, b) => b[1] - a[1]) : [],
        ...m,
      };
    })
    .filter((x): x is PhotoStat => !!x)
    .sort((a, b) => b.count - a.count || (b.views ?? 0) - (a.views ?? 0));

  const totalClicks = [...clicks.values()].reduce((n, v) => n + v, 0);
  const totalViews = [...views.values()].reduce((n, v) => n + v, 0);
  const profileCtaRows = [...profileCtas.entries()].sort((a, b) => b[1] - a[1]);

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

      <h3 className="mb-3 mt-7 text-body-sm font-medium text-muted">작가 프로필 페이지에서 누른 버튼</h3>
      <div className="rounded-2xl border border-line bg-surface p-4">
        {profileCtaRows.length === 0 ? (
          <p className="text-caption text-muted">아직 이 작가 프로필에서 누른 버튼이 없어요.</p>
        ) : (
          <ul className="space-y-2">
            {profileCtaRows.map(([k, n]) => (
              <li key={k} className="flex items-center justify-between gap-2 text-caption">
                <span className="min-w-0 flex-1 truncate text-fg">{k}</span>
                <span className="shrink-0 font-semibold tabular-nums text-muted">{fmt.format(n)}회</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h3 className="mb-1 mt-7 text-body-sm font-medium text-muted">사진별 클릭·조회</h3>
      <p className="mb-3 text-caption text-faint">사진을 누르면 그 사진 페이지에서 누른 버튼까지 볼 수 있어요.</p>
      {photos.length === 0 ? (
        <EmptyHint>이 작가의 사진에 대한 방문 기록이 아직 없어요.</EmptyHint>
      ) : (
        <PhotoInsights photos={photos} totalClicks={totalClicks} />
      )}
    </main>
  );
}

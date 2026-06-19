import { AnalyticsChrome } from "../AnalyticsChrome";
import { PageHeading, EmptyHint } from "../_ui";
import { loadAnalytics, fmtDuration } from "../_data";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function AnalyticsJourneysPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string; seg?: string; persona?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const data = await loadAnalytics(sp.range, sp.seg, sp.persona);
  const { sessions, pageName } = data;

  const journeys = sessions
    .filter((s) => s.converted)
    .sort((a, b) => b.lastTs - a.lastTs)
    .slice(0, 40)
    .map((s) => {
      const seq: string[] = [];
      for (const e of s.events) {
        if (e.type !== "pageview") continue;
        if (seq[seq.length - 1] !== e.path) seq.push(e.path);
      }
      return { id: s.id, member: !!s.profileId, durationSec: (s.lastTs - s.firstTs) / 1000, steps: seq.slice(0, 12) };
    });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <AnalyticsChrome active="journeys" data={data} />
      <PageHeading
        title="문의한 사람의 이동 경로"
        caption="문의·예약까지 도달한 손님이 입장부터 어떤 순서로 페이지를 옮겨 다녔는지 보여줘요."
      />
      {journeys.length === 0 ? (
        <EmptyHint>아직 문의까지 전환한 방문이 없어요.</EmptyHint>
      ) : (
        <ul className="space-y-2.5">
          {journeys.map((j) => (
            <li key={j.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-center gap-1.5 text-caption text-faint">
                <span className={cn("rounded-md px-1.5 py-0.5 font-medium", j.member ? "bg-fg/[0.06] text-fg" : "bg-fg/[0.04] text-muted")}>
                  {j.member ? "로그인 회원" : "비로그인 손님"}
                </span>
                <span>· 총 {fmtDuration(j.durationSec)} 머묾 · {j.steps.length}단계</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {j.steps.map((p, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-faint">→</span>}
                    <span className="rounded-md bg-fg/[0.06] px-2 py-1 text-caption text-fg">{pageName(p).title}</span>
                  </span>
                ))}
                <span className="text-faint">→</span>
                <span className="rounded-md bg-brand/10 px-2 py-1 text-caption font-semibold text-brand">문의 완료 ✓</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

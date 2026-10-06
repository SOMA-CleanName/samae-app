import Link from "next/link";
import { listSearchStats, type SearchStatGroup } from "@/lib/search-stats";
import { EmptyState } from "@/components/ui";
import { SearchStatsTable } from "./SearchStatsTable";
import { SearchDebug } from "./SearchDebug";
import { InterpretationChips } from "./InterpretationChips";

export const dynamic = "force-dynamic";

const PERIODS = [
  { label: "7일", value: "7" },
  { label: "30일", value: "30" },
  { label: "전체", value: "all" },
];

const VIEWS = [
  { label: "검색어 순위", value: "terms" },
  { label: "무드별", value: "moods" },
  { label: "최근 검색", value: "recent" },
] as const;
type View = (typeof VIEWS)[number]["value"];

const PILL = "rounded-full px-3 py-1 text-caption font-medium transition-colors";

function kst(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** 무드 가족 → 그 무드로 들어온 검색어(많은 순) — 「무드별」 보기 */
function byMood(groups: SearchStatGroup[], pick: (g: SearchStatGroup) => { name: string; count: number }[]) {
  const map = new Map<string, { total: number; terms: { term: string; count: number }[] }>();
  for (const g of groups) {
    for (const m of pick(g)) {
      const cur = map.get(m.name) ?? { total: 0, terms: [] };
      cur.total += m.count;
      cur.terms.push({ term: g.term, count: m.count });
      map.set(m.name, cur);
    }
  }
  return [...map.entries()]
    .map(([mood, v]) => ({ mood, total: v.total, terms: v.terms.sort((a, b) => b.count - a.count) }))
    .sort((a, b) => b.total - a.total);
}

/**
 * 검색 운영 — 사용자가 친 검색어가 **어느 목적 · 무드 가족으로 해석돼 어디로 갔는지** 본다.
 *
 * 검색은 검색어를 목적 + 무드로 나누고, 무드는 가장 가까운 무드 가족으로 틀어 찾는다(docs/47 §9 · §10).
 * 해석은 검색할 때 search_logs 에 같이 남긴다(0049 해석 칸, lib/search-interpretation).
 * 이걸 봐야 무드 사전이 엇나간 곳 — 엉뚱한 가족으로 간 검색어, 애매해서 큰 무드로 퍼진 검색어 — 을 찾는다.
 */
export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const daysParam = sp.days === "7" || sp.days === "all" ? sp.days : "30";
  const sinceDays = daysParam === "all" ? null : Number(daysParam);
  const view: View = VIEWS.some((v) => v.value === sp.view) ? (sp.view as View) : "terms";

  const { groups, totalSearches, uniqueTerms, zeroResultCount, recent } = await listSearchStats(sinceDays);

  const routeTotals = new Map<string, number>();
  for (const g of groups) for (const r of g.routes) routeTotals.set(r.name, (routeTotals.get(r.name) ?? 0) + r.count);
  const exact = routeTotals.get("무드 가족 · 정확") ?? 0;
  const vague = routeTotals.get("큰 무드 · 애매") ?? 0;
  const pct = (n: number) => (totalSearches ? Math.round((n / totalSearches) * 100) : 0);

  const href = (next: { days?: string; view?: string }) =>
    `/admin/search?days=${next.days ?? daysParam}&view=${next.view ?? view}`;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">검색</h1>
      <p className="mt-1 text-body-sm leading-relaxed text-muted">
        사용자가 친 검색어가 <b className="font-semibold text-fg">어느 목적 · 무드로 해석돼</b> 어디로 갔는지 봐요.
        검색은 검색어를 목적과 무드로 나누고, 무드는 가장 가까운 <b className="font-semibold text-fg">무드 가족</b>으로
        틀어 찾아요. <b className="font-semibold text-fg">정확</b>은 그 가족 사진만, <b className="font-semibold text-fg">애매</b>는
        큰 무드 전체로 퍼진 검색이에요.
      </p>
      <p className="mt-1.5 text-caption leading-relaxed text-faint">
        대소문자 · 띄어쓰기는 합치고 가까운 오타는 대표어 아래로 묶어요. ‘결과0’은 한 번도 결과를 못 준 검색어 — 누락된
        무드나 신규 카테고리 후보예요.
      </p>

      {/* 기간 */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {PERIODS.map((p) => (
          <Link
            key={p.value}
            href={href({ days: p.value })}
            aria-current={p.value === daysParam ? "page" : undefined}
            className={`${PILL} ${p.value === daysParam ? "bg-fg text-bg" : "bg-fg/[0.06] text-muted hover:text-fg"}`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {/* 요약 */}
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          { label: "총 검색", value: totalSearches },
          { label: "고유 검색어", value: uniqueTerms },
          { label: "결과0 검색어", value: zeroResultCount },
          { label: "무드 가족 · 정확", value: `${exact} (${pct(exact)}%)` },
          { label: "큰 무드 · 애매", value: `${vague} (${pct(vague)}%)` },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-surface px-3 py-2.5">
            <dt className="text-[11px] text-faint">{s.label}</dt>
            <dd className="mt-0.5 tabular-nums text-body font-semibold">{s.value}</dd>
          </div>
        ))}
      </dl>

      {/* 보기 */}
      <nav className="mt-6 flex gap-1 border-b border-line" aria-label="보기">
        {VIEWS.map((v) => (
          <Link
            key={v.value}
            href={href({ view: v.value })}
            aria-current={v.value === view ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
              v.value === view ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {totalSearches === 0 ? (
        <EmptyState
          className="mt-6"
          title="아직 쌓인 검색 기록이 없어요"
          description="search_logs 표가 운영 DB 에 있어야 쌓여요(0049). 적용 뒤 홈에서 검색하면 여기 나타나요."
        />
      ) : view === "terms" ? (
        <SearchStatsTable groups={groups} />
      ) : view === "moods" ? (
        <MoodView groups={groups} />
      ) : (
        <RecentView recent={recent} />
      )}

      {/* 시뮬레이터 */}
      <section className="mt-10 border-t border-line pt-6">
        <h2 className="text-h2 font-semibold">검색 시뮬레이터</h2>
        <p className="mt-1 text-body-sm text-muted">
          검색어를 넣으면 실제 검색과 같은 길로 해석해 <b className="font-semibold text-fg">어느 목적 · 무드로 가는지</b>,
          몇 장이 나오는지 보여줘요. 아래에는 태그 점수(예전 채점)도 함께 보여줘요.
        </p>
        <SearchDebug />
      </section>
    </main>
  );
}

function MoodView({ groups }: { groups: SearchStatGroup[] }) {
  const moods = byMood(groups, (g) => g.moods);
  const filled = byMood(groups, (g) => g.filled);
  return (
    <div className="mt-4 space-y-6">
      <p className="text-caption text-faint">
        무드 가족마다 어떤 검색어가 그리로 갔는지예요. 엉뚱한 검색어가 섞여 있으면 무드 사전을 고칠 자리예요.
      </p>
      {moods.length === 0 ? (
        <p className="text-body-sm text-muted">무드 가족으로 간 검색이 아직 없어요.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {moods.map((m) => (
            <li key={m.mood} className="rounded-xl border border-line bg-surface p-3">
              <div className="flex items-baseline gap-2">
                <span className="rounded-full bg-fg px-2 py-0.5 text-[12px] font-semibold text-bg">{m.mood}</span>
                <span className="tabular-nums text-caption text-muted">검색 {m.total}</span>
              </div>
              <p className="mt-2 flex flex-wrap gap-1">
                {m.terms.map((t) => (
                  <span key={t.term} className="rounded-full bg-fg/[0.06] px-2 py-0.5 text-[11px] text-muted">
                    {t.term} <span className="tabular-nums text-faint">×{t.count}</span>
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ul>
      )}
      {filled.length > 0 && (
        <section>
          <h3 className="text-body-sm font-semibold">사진이 모자라 이어 붙인 무드</h3>
          <p className="mt-0.5 text-caption text-faint">잡힌 가족에 사진이 적어 비슷한 무드로 채운 경우예요 — 그 무드의 사진이 부족하다는 신호예요.</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {filled.map((m) => (
              <li key={m.mood} className="rounded-full border border-line-strong px-2.5 py-1 text-[11px] text-muted">
                {m.mood} <span className="tabular-nums text-faint">×{m.total}</span>
                <span className="text-faint"> ← {m.terms.slice(0, 3).map((t) => t.term).join(", ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RecentView({ recent }: { recent: Awaited<ReturnType<typeof listSearchStats>>["recent"] }) {
  return (
    <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {recent.map((r, idx) => (
        <li key={`${r.at}-${idx}`} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
          <span className="w-24 shrink-0 tabular-nums text-caption text-faint">{kst(r.at)}</span>
          <span className="min-w-0 shrink-0 truncate text-body-sm font-semibold sm:w-40">{r.raw}</span>
          <span className={`w-14 shrink-0 tabular-nums text-caption ${r.resultCount === 0 ? "text-warning-ink" : "text-muted"}`}>
            {r.resultCount}장
          </span>
          <InterpretationChips interpretation={r} />
        </li>
      ))}
    </ul>
  );
}

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { clearAnalytics } from "./actions";
import { PasswordReset } from "@/components/admin/PasswordReset";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("ko-KR");
const FETCH_CAP = 20000; // 집계용 최근 이벤트 상한

const RANGES = [
  { key: "1", label: "오늘", days: 1 },
  { key: "7", label: "7일", days: 7 },
  { key: "30", label: "30일", days: 30 },
];

type Ev = {
  session_id: string;
  profile_id: string | null;
  type: "pageview" | "click";
  path: string;
  label: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  created_at: string;
};

function topBy<T>(items: T[], key: (t: T) => string | null, limit: number) {
  const counts = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

// 행동 분석 — 페이지뷰·CTA·이탈률. 가드는 (admin)/layout. service-role 조회.
export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string }>;
}) {
  const rangeKey = (await searchParams)?.range ?? "7";
  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[1];
  const sinceIso = new Date(Date.now() - range.days * 86400000).toISOString();

  const admin = createAdminClient();
  const { data } = await admin
    .from("analytics_events")
    .select("session_id, profile_id, type, path, label, utm_source, utm_campaign, created_at")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(FETCH_CAP);

  const events = (data ?? []) as Ev[];
  const pageviews = events.filter((e) => e.type === "pageview");
  const clicks = events.filter((e) => e.type === "click");

  // 세션별 페이지뷰 수 → 이탈률(단일 페이지뷰 세션)
  const pvBySession = new Map<string, number>();
  for (const e of pageviews) pvBySession.set(e.session_id, (pvBySession.get(e.session_id) ?? 0) + 1);
  const sessions = pvBySession.size;
  const bounced = [...pvBySession.values()].filter((n) => n === 1).length;
  const bounceRate = sessions > 0 ? Math.round((bounced / sessions) * 100) : 0;
  const loggedInSessions = new Set(events.filter((e) => e.profile_id).map((e) => e.session_id)).size;

  const topPages = topBy(pageviews, (e) => e.path, 12);
  const topCtas = topBy(clicks, (e) => e.label, 12);
  // 유입(광고) — 첫 페이지뷰 기준이 이상적이나 단순화: 페이지뷰 이벤트의 utm 집계
  const topSources = topBy(pageviews, (e) => e.utm_source, 8);
  const topCampaigns = topBy(pageviews, (e) => e.utm_campaign, 8);
  const capped = events.length >= FETCH_CAP;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold">분석</h1>
          <p className="mt-1 text-body-sm text-muted">고객 행동 — 페이지뷰·CTA·이탈률 (운영자 전용)</p>
        </div>
        <PasswordReset action={clearAnalytics} label="데이터 초기화" />
      </div>

      {/* 기간 */}
      <div className="mt-5 flex gap-1.5">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={`/admin/analytics?range=${r.key}`}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-caption font-medium transition-colors",
              r.key === range.key ? "border-fg bg-fg text-bg" : "border-line-strong text-muted hover:bg-fg/[0.04]"
            )}
          >
            {r.label}
          </Link>
        ))}
      </div>

      {events.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="아직 수집된 데이터가 없어요"
          description="마이그레이션(0036) 적용 후 방문이 쌓이면 표시돼요."
        />
      ) : (
        <>
          {/* 요약 */}
          <h2 className="mt-7 text-body-sm font-medium text-muted">요약</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="페이지뷰" value={fmt.format(pageviews.length)} />
            <Stat label="순 세션" value={fmt.format(sessions)} />
            <Stat label="이탈률" value={`${bounceRate}%`} accent={bounceRate >= 70} />
            <Stat label="CTA 클릭" value={fmt.format(clicks.length)} />
          </div>
          <p className="mt-2 text-caption text-faint">
            로그인 세션 {fmt.format(loggedInSessions)} · 이탈률 = 페이지 1개만 보고 떠난 세션 비율
            {capped && ` · 최근 ${fmt.format(FETCH_CAP)}건만 집계`}
          </p>

          {/* 인기 콘텐츠 */}
          <h2 className="mt-8 text-body-sm font-medium text-muted">인기 콘텐츠</h2>
          <div className="mt-3 grid grid-cols-1 gap-6 md:grid-cols-2">
            <RankCard title="인기 페이지" rows={topPages} total={pageviews.length} mono />
            <RankCard title="인기 CTA / 클릭" rows={topCtas} total={clicks.length} />
          </div>

          {/* 광고 유입 (UTM) */}
          {(topSources.length > 0 || topCampaigns.length > 0) && (
            <>
              <h2 className="mt-8 text-body-sm font-medium text-muted">광고 유입</h2>
              <div className="mt-3 grid grid-cols-1 gap-6 md:grid-cols-2">
                <RankCard title="유입 소스 (utm_source)" rows={topSources} total={pageviews.length} />
                <RankCard title="캠페인 (utm_campaign)" rows={topCampaigns} total={pageviews.length} />
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-4", accent ? "border-brand/30 bg-brand/[0.04]" : "border-line bg-surface")}>
      <p className={cn("text-h2 font-semibold tabular-nums", accent ? "text-brand" : "text-fg")}>{value}</p>
      <p className="mt-0.5 text-caption text-muted">{label}</p>
    </div>
  );
}

function RankCard({
  title,
  rows,
  total,
  mono,
}: {
  title: string;
  rows: [string, number][];
  total: number;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="text-body-sm font-semibold text-fg">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-caption text-faint">데이터 없음</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map(([k, n]) => {
            const pct = total > 0 ? Math.round((n / total) * 100) : 0;
            return (
              <li key={k}>
                <div className="flex items-center justify-between gap-3 text-caption">
                  <span className={cn("min-w-0 flex-1 truncate text-fg", mono && "tabular-nums")}>{k}</span>
                  <span className="shrink-0 text-muted">
                    <b className="text-fg tabular-nums">{fmt.format(n)}</b> · {pct}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-fg/[0.06]">
                  <div className="h-full rounded-full bg-fg/30" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

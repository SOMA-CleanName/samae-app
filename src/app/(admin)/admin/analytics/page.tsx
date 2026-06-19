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
  type: "pageview" | "click" | "scroll";
  path: string;
  label: string | null;
  target: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  created_at: string;
};

// 세션 단위 요약 — 세그먼트(페르소나) 판정·체류시간·이탈위치의 기준
type Session = {
  id: string;
  profileId: string | null;
  events: Ev[];
  pageviews: number;
  firstTs: number;
  lastTs: number;
  lastPath: string | null; // 마지막 페이지뷰 = 이탈 위치
  converted: boolean; // 문의(예약) 전환 여부
};

// ──────────────────────────────────────────────────────────────
// 세그먼트(페르소나) 정의 — ⭐ 페르소나가 확정되면 여기만 바꾸면 됩니다.
// 각 항목에 { key, label, match(session) } 만 추가/교체하면 아래 모든 지표가
// 자동으로 그 기준으로 분리돼 표시됩니다. (지금은 행동 기반 임시 세그먼트)
// ──────────────────────────────────────────────────────────────
const SEGMENTS: { key: string; label: string; match: (s: Session) => boolean }[] = [
  { key: "all", label: "전체", match: () => true },
  { key: "guest", label: "비로그인", match: (s) => !s.profileId },
  { key: "member", label: "로그인", match: (s) => !!s.profileId },
  { key: "converted", label: "문의 전환", match: (s) => s.converted },
];

function topBy(items: Session[], pick: (s: Session) => string | null, limit: number) {
  const counts = new Map<string, number>();
  for (const s of items) {
    const k = pick(s);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function topByEvent(items: Session[], pick: (e: Ev) => string | null, limit: number) {
  const counts = new Map<string, number>();
  for (const s of items) for (const e of s.events) {
    const k = pick(e);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}초`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

// 행동 분석 — 세그먼트(페르소나)별. 작가·관리자 트래킹 제외. 가드는 (admin)/layout.
export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string; seg?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const range = RANGES.find((r) => r.key === sp.range) ?? RANGES[1];
  const seg = SEGMENTS.find((s) => s.key === sp.seg) ?? SEGMENTS[0];
  const sinceIso = new Date(Date.now() - range.days * 86400000).toISOString();

  const admin = createAdminClient();
  const [{ data: evData }, { data: phRows }, { data: adminRows }, { data: inqRows }] = await Promise.all([
    admin
      .from("analytics_events")
      .select("session_id, profile_id, type, path, label, target, utm_source, utm_campaign, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(FETCH_CAP),
    admin.from("photographers").select("profile_id"),
    admin.from("profiles").select("id").eq("role", "admin"),
    admin.from("inquiries").select("profile_id").not("profile_id", "is", null),
  ]);

  // 작가·관리자 profile 제외 (고객 행동만)
  const excluded = new Set<string>([
    ...(phRows ?? []).map((r) => r.profile_id as string),
    ...(adminRows ?? []).map((r) => r.id as string),
  ]);
  const inquirers = new Set<string>((inqRows ?? []).map((r) => r.profile_id as string));

  const events = ((evData ?? []) as Ev[])
    .filter((e) => !(e.profile_id && excluded.has(e.profile_id)))
    .sort((a, b) => a.created_at.localeCompare(b.created_at)); // 시간순(세션 경로용)
  const capped = (evData?.length ?? 0) >= FETCH_CAP;

  // 세션 단위 묶기
  const map = new Map<string, Session>();
  for (const e of events) {
    let s = map.get(e.session_id);
    if (!s) {
      s = { id: e.session_id, profileId: e.profile_id, events: [], pageviews: 0, firstTs: Infinity, lastTs: 0, lastPath: null, converted: false };
      map.set(e.session_id, s);
    }
    if (e.profile_id) s.profileId = e.profile_id;
    s.events.push(e);
    const ts = Date.parse(e.created_at);
    s.firstTs = Math.min(s.firstTs, ts);
    s.lastTs = Math.max(s.lastTs, ts);
    if (e.type === "pageview") {
      s.pageviews += 1;
      s.lastPath = e.path; // 시간순이라 마지막 pageview = 이탈 위치
    }
    if ((e.type === "click" && (e.target ?? "").includes("/inquiry")) || (e.profile_id && inquirers.has(e.profile_id))) {
      s.converted = true;
    }
  }
  const allSessions = [...map.values()];
  const sessions = allSessions.filter((s) => seg.match(s));

  // 지표
  const totalPageviews = sessions.reduce((n, s) => n + s.pageviews, 0);
  const totalClicks = sessions.reduce((n, s) => n + s.events.filter((e) => e.type === "click").length, 0);
  const sessionCount = sessions.length;
  const bounced = sessions.filter((s) => s.pageviews === 1).length;
  const bounceRate = sessionCount > 0 ? Math.round((bounced / sessionCount) * 100) : 0;
  const avgDuration = sessionCount > 0 ? sessions.reduce((n, s) => n + (s.lastTs - s.firstTs) / 1000, 0) / sessionCount : 0;
  const conversions = sessions.filter((s) => s.converted).length;
  const convRate = sessionCount > 0 ? Math.round((conversions / sessionCount) * 100) : 0;

  // 무한스크롤 뎁스 — 세션이 도달한 최대 뎁스(누적 도달률)
  const scrollEvents = sessions.flatMap((s) => s.events).filter((e) => e.type === "scroll");
  const reach = (min: number) => scrollEvents.filter((e) => Number(e.label) >= min).length;
  const scrollRows: [string, number][] = [
    ["25% 이상", reach(25)],
    ["50% 이상", reach(50)],
    ["75% 이상", reach(75)],
    ["100% (끝까지)", reach(100)],
  ];

  // 보기 옵션 클릭 — 가격/작가명 표시 토글
  const clickEvents = sessions.flatMap((s) => s.events).filter((e) => e.type === "click");
  const optionRows: [string, number][] = [
    ["가격 표시", clickEvents.filter((e) => e.label === "toggle:price").length],
    ["작가명 표시", clickEvents.filter((e) => e.label === "toggle:name").length],
  ];

  const topExit = topBy(sessions, (s) => s.lastPath, 10); // 이탈 위치
  const topPhotos = topByEvent(sessions, (e) => (e.type === "click" && (e.target ?? "").startsWith("/photos/") ? e.target : null), 10);
  const topPages = topByEvent(sessions, (e) => (e.type === "pageview" ? e.path : null), 12);
  const topCtas = topByEvent(sessions, (e) => (e.type === "click" ? e.label : null), 12);
  const topSources = topByEvent(sessions, (e) => (e.type === "pageview" ? e.utm_source : null), 8);
  const topCampaigns = topByEvent(sessions, (e) => (e.type === "pageview" ? e.utm_campaign : null), 8);

  const qs = (next: { range?: string; seg?: string }) =>
    `/admin/analytics?range=${next.range ?? range.key}&seg=${next.seg ?? seg.key}`;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold">분석</h1>
          <p className="mt-1 text-body-sm text-muted">고객 행동 — 세그먼트별 (작가·관리자 제외)</p>
        </div>
        <PasswordReset action={clearAnalytics} label="데이터 초기화" />
      </div>

      {/* 기간 */}
      <div className="mt-5 flex gap-1.5">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={qs({ range: r.key })}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-caption font-medium transition-colors",
              r.key === range.key ? "border-fg bg-fg text-bg" : "border-line-strong text-muted hover:bg-fg/[0.04]"
            )}
          >
            {r.label}
          </Link>
        ))}
      </div>

      {/* 세그먼트(페르소나) */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-caption text-faint">세그먼트</span>
        <div className="flex flex-wrap gap-1.5">
          {SEGMENTS.map((s) => {
            const n = allSessions.filter((x) => s.match(x)).length;
            return (
              <Link
                key={s.key}
                href={qs({ seg: s.key })}
                className={cn(
                  "rounded-full border px-3 py-1 text-caption font-medium transition-colors",
                  s.key === seg.key ? "border-brand bg-brand/[0.06] text-brand" : "border-line-strong text-muted hover:bg-fg/[0.04]"
                )}
              >
                {s.label} <span className="tabular-nums opacity-70">{fmt.format(n)}</span>
              </Link>
            );
          })}
        </div>
      </div>
      <p className="mt-1 text-caption text-faint">
        페르소나가 확정되면 세그먼트 정의만 교체하면 모든 지표가 그 기준으로 자동 분리돼요.
      </p>

      {events.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="아직 수집된 데이터가 없어요"
          description="방문이 쌓이면 표시돼요. (작가·관리자 방문은 제외)"
        />
      ) : (
        <>
          {/* 요약 */}
          <h2 className="mt-7 text-body-sm font-medium text-muted">요약 · {seg.label}</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="순 세션" value={fmt.format(sessionCount)} />
            <Stat label="페이지뷰" value={fmt.format(totalPageviews)} />
            <Stat label="평균 체류" value={fmtDuration(avgDuration)} />
            <Stat label="이탈률" value={`${bounceRate}%`} accent={bounceRate >= 70} />
            <Stat label="CTA 클릭" value={fmt.format(totalClicks)} />
            <Stat label="문의 전환" value={`${fmt.format(conversions)} · ${convRate}%`} accent={conversions > 0} />
          </div>
          <p className="mt-2 text-caption text-faint">
            체류 = 세션 첫~마지막 이벤트 간격 · 이탈률 = 페이지 1개만 보고 떠난 비율
            {capped && ` · 최근 ${fmt.format(FETCH_CAP)}건만 집계`}
          </p>

          {/* 행동 */}
          <h2 className="mt-8 text-body-sm font-medium text-muted">행동</h2>
          <div className="mt-3 grid grid-cols-1 gap-6 md:grid-cols-2">
            <RankCard title="이탈 위치 (마지막 페이지)" rows={topExit} total={sessionCount} mono />
            <RankCard title="가장 많이 클릭된 사진" rows={topPhotos} total={topPhotos.reduce((n, r) => n + r[1], 0)} mono />
          </div>
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <RankCard title="인기 페이지" rows={topPages} total={totalPageviews} mono />
            <RankCard title="인기 CTA / 클릭" rows={topCtas} total={totalClicks} />
          </div>

          {/* 참여 */}
          <h2 className="mt-8 text-body-sm font-medium text-muted">참여</h2>
          <div className="mt-3 grid grid-cols-1 gap-6 md:grid-cols-2">
            <RankCard title="무한스크롤 뎁스 (최대 도달)" rows={scrollRows} total={reach(25)} />
            <RankCard title="보기 옵션 클릭 (세션 대비)" rows={optionRows} total={sessionCount} />
          </div>

          {/* 유입 */}
          {(topSources.length > 0 || topCampaigns.length > 0) && (
            <>
              <h2 className="mt-8 text-body-sm font-medium text-muted">광고 유입</h2>
              <div className="mt-3 grid grid-cols-1 gap-6 md:grid-cols-2">
                <RankCard title="유입 소스 (utm_source)" rows={topSources} total={totalPageviews} />
                <RankCard title="캠페인 (utm_campaign)" rows={topCampaigns} total={totalPageviews} />
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

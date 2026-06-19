import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { AnalyticsChrome } from "./AnalyticsChrome";
import { Stat } from "./_ui";
import {
  loadAnalytics,
  fmt,
  fmtDuration,
  matchPhoto,
  buildQs,
  type Session,
} from "./_data";

export const dynamic = "force-dynamic";

export default async function AnalyticsOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string; seg?: string; persona?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const data = await loadAnalytics(sp.range, sp.seg, sp.persona);
  const { sessions, seg, persona, range, events } = data;
  const qs = buildQs(range.key, seg.key, persona.key);

  // 요약 지표
  const sessionCount = sessions.length;
  const totalPageviews = sessions.reduce((n, s) => n + s.pageviews, 0);
  const totalClicks = sessions.reduce((n, s) => n + s.events.filter((e) => e.type === "click").length, 0);
  const bounced = sessions.filter((s) => s.pageviews === 1).length;
  const bounceRate = sessionCount > 0 ? Math.round((bounced / sessionCount) * 100) : 0;
  const avgDuration = sessionCount > 0 ? sessions.reduce((n, s) => n + (s.lastTs - s.firstTs) / 1000, 0) / sessionCount : 0;
  const conversions = sessions.filter((s) => s.converted).length;
  const convRate = sessionCount > 0 ? Math.round((conversions / sessionCount) * 100) : 0;

  // 미리보기용 가벼운 집계
  const clickedPhotos = new Set<string>();
  let photoClickTotal = 0;
  for (const s of sessions)
    for (const e of s.events)
      if (e.type === "click") {
        const id = matchPhoto(e.target ?? "");
        if (id) {
          clickedPhotos.add(id);
          photoClickTotal++;
        }
      }

  const topPage = topByEvent(sessions, (e) => (e.type === "pageview" ? e.path : null), 1)[0];
  const scrollAll = sessions.flatMap((s) => s.events).filter((e) => e.type === "scroll");
  const avgScreens = scrollAll.length > 0 ? scrollAll.reduce((n, e) => n + Number(e.label || 0), 0) / scrollAll.length : 0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <AnalyticsChrome active="overview" data={data} />

      {events.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="아직 쌓인 방문 기록이 없어요"
          description="손님이 사이트를 둘러보면 여기에 표시돼요. (작가·관리자 방문은 제외)"
        />
      ) : (
        <>
          <p className="mt-6 text-caption text-faint">
            실제 페르소나가 정해지면 분류 기준만 바꾸면 아래 모든 숫자가 그 사람들 기준으로 다시 계산돼요.
          </p>

          {/* 요약 */}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="방문한 사람" value={fmt.format(sessionCount)} hint="세션 수" />
            <Stat label="본 페이지 수" value={fmt.format(totalPageviews)} hint="전체 조회" />
            <Stat label="평균 머문 시간" value={fmtDuration(avgDuration)} hint="입장~퇴장" />
            <Stat label="바로 떠난 비율" value={`${bounceRate}%`} hint="1페이지만 보고 이탈" accent={bounceRate >= 70} />
            <Stat label="버튼 클릭 수" value={fmt.format(totalClicks)} hint="CTA 포함" />
            <Stat label="문의까지 전환" value={`${fmt.format(conversions)}명`} hint={`전환율 ${convRate}%`} accent={conversions > 0} />
          </div>

          {/* 탭 바로가기 카드 */}
          <h2 className="mt-9 text-body-sm font-medium text-muted">자세히 보기</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NavCard
              href={`/admin/analytics/photos${qs}`}
              title="인기 사진"
              big={`${fmt.format(clickedPhotos.size)}개`}
              desc={`사진이 클릭됨 · 총 ${fmt.format(photoClickTotal)}회 클릭`}
            />
            <NavCard
              href={`/admin/analytics/pages${qs}`}
              title="페이지별 현황"
              big={topPage ? data.pageName(topPage[0]).title : "—"}
              desc={topPage ? `가장 많이 본 페이지 · ${fmt.format(topPage[1])}회 조회` : "데이터 없음"}
            />
            <NavCard
              href={`/admin/analytics/photographers${qs}`}
              title="작가별"
              big="작가 → 사진"
              desc="작가별 인기, 작가 안에서 사진별로 드릴다운"
            />
            <NavCard
              href={`/admin/analytics/journeys${qs}`}
              title="전환 경로"
              big={`${fmt.format(conversions)}명`}
              desc="문의까지 도달한 사람의 이동 경로"
            />
            <NavCard
              href={`/admin/analytics/engagement${qs}`}
              title="참여·유입"
              big={`평균 ${avgScreens.toFixed(1)}화면`}
              desc="무한스크롤 깊이 · 보기 옵션 · 광고 유입"
            />
          </div>
        </>
      )}
    </main>
  );
}

function NavCard({ href, title, big, desc }: { href: string; title: string; big: string; desc: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-fg/[0.02]"
    >
      <div className="min-w-0">
        <p className="text-caption font-medium text-muted">{title}</p>
        <p className="mt-0.5 truncate text-h3 font-semibold text-fg">{big}</p>
        <p className="mt-0.5 text-caption text-faint">{desc}</p>
      </div>
      <span className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </Link>
  );
}

function topByEvent(items: Session[], pick: (e: { type: string; path: string }) => string | null, limit: number) {
  const counts = new Map<string, number>();
  for (const s of items)
    for (const e of s.events) {
      const k = pick(e);
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

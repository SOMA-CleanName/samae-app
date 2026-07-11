import { AnalyticsChrome } from "../AnalyticsChrome";
import { PageHeading, Stat, EmptyHint } from "../_ui";
import { loadAnalytics, fmt, type Session } from "../_data";
import { listPublishedCategories } from "@/lib/categories";

export const dynamic = "force-dynamic";

// 유입 경로(랜딩·소스·매체·캠페인·소재)별 세션 수 + 문의 전환율.
// 개시 직후 메타 광고 4종(카테고리별 /c/ 랜딩) 성과를 한눈에 보기 위한 탭.

// 쿼리스트링 제거 — /c/wedding?utm=... 을 /c/wedding 으로 묶어 랜딩별 집계가 흩어지지 않게.
function cleanPath(p: string | null): string | null {
  if (!p) return null;
  return p.split(/[?#]/)[0] || p;
}

// 랜딩 경로에서 카테고리 slug 추출 — /c/<slug> 유입만 카테고리별로 집계.
function categorySlug(landing: string | null): string | null {
  const p = cleanPath(landing);
  const m = p?.match(/^\/c\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// 세션을 key 로 묶어 세션 수·전환 수 집계 → 세션 많은 순 정렬.
function aggBy(sessions: Session[], keyOf: (s: Session) => string | null) {
  const m = new Map<string, { sessions: number; conv: number }>();
  for (const s of sessions) {
    const k = keyOf(s);
    if (k == null) continue;
    const a = m.get(k) ?? { sessions: 0, conv: 0 };
    a.sessions += 1;
    if (s.converted) a.conv += 1;
    m.set(k, a);
  }
  return [...m.entries()].sort((a, b) => b[1].sessions - a[1].sessions);
}

// 매체 표기 정규화 — paid_social/social/none 을 사람이 읽는 이름으로.
function mediumLabel(m: string | null): string {
  if (!m) return "직접·미태그";
  if (/paid/i.test(m)) return `유료 광고 (${m})`;
  if (/social/i.test(m)) return `오가닉 소셜 (${m})`;
  return m;
}

export default async function AnalyticsAdsPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string; seg?: string; persona?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const [data, cats] = await Promise.all([
    loadAnalytics(sp.range, sp.seg, sp.persona),
    listPublishedCategories(),
  ]);
  const { sessions } = data;
  const catName = new Map(cats.map((c) => [c.slug, c.name]));

  const total = sessions.length;
  const tagged = sessions.filter((s) => s.acq.source || s.acq.medium || s.acq.campaign);
  const paid = sessions.filter((s) => s.acq.medium && /paid/i.test(s.acq.medium));
  const organicSocial = sessions.filter((s) => s.acq.medium === "social");
  const taggedConv = tagged.filter((s) => s.converted).length;

  // 카테고리별 유입 — /c/<slug> 랜딩만. slug → 한글 카테고리명.
  const byCategory = aggBy(sessions, (s) => {
    const slug = categorySlug(s.acq.landing);
    return slug ? (catName.get(slug) ?? slug) : null;
  });
  const byLanding = aggBy(sessions, (s) => cleanPath(s.acq.landing));
  const byMedium = aggBy(sessions, (s) => mediumLabel(s.acq.medium));
  const bySource = aggBy(sessions, (s) => s.acq.source ?? "직접·미태그");
  const byCampaign = aggBy(tagged, (s) => s.acq.campaign);
  const byContent = aggBy(tagged, (s) => s.acq.content);

  const hasAny = tagged.length > 0 || byLanding.length > 0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <AnalyticsChrome active="ads" data={data} />
      <PageHeading
        title="광고·유입 분석"
        caption="어디서(소스·매체·캠페인·소재) 들어와 어느 랜딩에 도착했고, 그중 몇 명이 문의까지 갔는지 봐요. 유료 광고는 utm_medium=paid_social, 스토리 등 오가닉은 social 로 구분돼요."
      />

      {!hasAny ? (
        <EmptyHint>아직 유입 태그(UTM)가 붙은 방문이 없어요. 광고·스토리 링크에 UTM 이 붙으면 여기 집계돼요.</EmptyHint>
      ) : (
        <>
          {/* 요약 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="태그된 유입" value={fmt.format(tagged.length)} hint={`전체 ${fmt.format(total)}세션 중`} />
            <Stat label="유료 광고" value={fmt.format(paid.length)} hint="paid_social" />
            <Stat label="오가닉 소셜" value={fmt.format(organicSocial.length)} hint="스토리·프로필 링크 등" />
            <Stat
              label="유입 → 문의 전환"
              value={`${fmt.format(taggedConv)}명`}
              hint={tagged.length > 0 ? `전환율 ${Math.round((taggedConv / tagged.length) * 100)}%` : "—"}
              accent={taggedConv > 0}
            />
          </div>

          <AcqCard
            title="카테고리별 유입 (컨셉 랜딩)"
            desc="/c/<카테고리> 랜딩으로 들어온 유입만 카테고리별로. 어떤 컨셉(웨딩·커플·스냅·컨셉)이 잘 먹히는지 · 광고/스토리 공통."
            rows={byCategory}
          />
          <AcqCard
            title="랜딩 페이지별 성과 (전체)"
            desc="카테고리 외 모든 랜딩 포함. 광고·링크로 처음 도착한 페이지."
            rows={byLanding}
          />
          <AcqCard
            title="유입 매체별 (유료 vs 오가닉)"
            desc="paid_social=메타 유료 광고 · social=내 스토리 등 오가닉 · 직접·미태그=UTM 없이 들어옴."
            rows={byMedium}
          />
          <AcqCard title="캠페인별" desc="utm_campaign 기준. 광고 캠페인·스토리 캠페인 단위 성과." rows={byCampaign} />
          <AcqCard title="광고 소재별" desc="utm_content 기준. 어떤 컷툰·이미지 소재가 문의를 잘 만드는지." rows={byContent} />
          <AcqCard title="유입 소스별" desc="utm_source 기준 (instagram, meta 등). 직접 방문 포함." rows={bySource} />
        </>
      )}
    </main>
  );
}

// 유입 차원 1개를 [이름 · 세션 · 문의 · 전환율] 표로. 세션 막대 + 전환율 강조.
function AcqCard({
  title,
  desc,
  rows,
}: {
  title: string;
  desc: string;
  rows: [string, { sessions: number; conv: number }][];
}) {
  const max = rows.reduce((n, [, v]) => Math.max(n, v.sessions), 0);
  return (
    <section className="mt-8">
      <h3 className="text-body-sm font-semibold text-fg">{title}</h3>
      <p className="mb-3 mt-0.5 text-caption text-faint">{desc}</p>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong bg-surface px-4 py-6 text-center text-caption text-faint">
          데이터 없음
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, 12).map(([k, v]) => {
            const pct = max > 0 ? Math.round((v.sessions / max) * 100) : 0;
            const conv = v.sessions > 0 ? Math.round((v.conv / v.sessions) * 100) : 0;
            return (
              <li key={k} className="rounded-xl border border-line bg-surface px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-caption font-medium text-fg">{k}</span>
                  <span className="shrink-0 text-caption text-muted">
                    <b className="tabular-nums text-fg">{fmt.format(v.sessions)}</b> 세션 · 문의{" "}
                    <b className="tabular-nums text-fg">{fmt.format(v.conv)}</b>
                    <span className={conv > 0 ? "ml-1 font-semibold text-brand" : "ml-1 text-faint"}>({conv}%)</span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fg/[0.06]">
                  <div className="h-full rounded-full bg-fg/30" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

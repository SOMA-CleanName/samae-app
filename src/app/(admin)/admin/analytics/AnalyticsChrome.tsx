import Link from "next/link";
import { cn } from "@/lib/cn";
import { clearAnalytics } from "./actions";
import { PasswordReset } from "@/components/admin/PasswordReset";
import { RANGES, SEGMENTS, PERSONAS, TABS, fmt, buildQs, type AnalyticsData } from "./_data";

// 분석 대시보드 공통 상단 — 제목 + 기간 + 기본 구분 + 페르소나 + 탭 네비.
// 기본 구분과 페르소나는 서로 독립(교집합). 모든 탭에서 range·seg·persona 유지.
export function AnalyticsChrome({ active, data }: { active: string; data: AnalyticsData }) {
  const { range, seg, persona, allSessions } = data;
  const qs = buildQs(range.key, seg.key, persona.key);
  const activeTab = TABS.find((t) => t.key === active);
  const base = activeTab?.path ?? "/admin/analytics";

  return (
    <div className="border-b border-line pb-1">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold">방문자 분석</h1>
          <p className="mt-1 text-body-sm text-muted">
            손님들이 어떤 사진을 보고 어디서 떠나는지 — 작가·관리자 본인 방문은 빼고 집계해요.
          </p>
        </div>
        <PasswordReset action={clearAnalytics} label="데이터 초기화" />
      </div>

      {/* 기간 */}
      <div className="mt-5">
        <p className="mb-1.5 text-caption font-medium text-faint">기간</p>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={`${base}${buildQs(r.key, seg.key, persona.key)}`}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-caption font-medium transition-colors",
                r.key === range.key ? "border-fg bg-fg text-bg" : "border-line-strong text-muted hover:bg-fg/[0.04]"
              )}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      {/* 기본 구분 (계정·행동) — 페르소나와 독립 */}
      <div className="mt-4">
        <p className="mb-1.5 text-caption font-medium text-faint">기본 구분 (계정·행동)</p>
        <div className="flex flex-wrap gap-1.5">
          {SEGMENTS.map((s) => {
            const n = allSessions.filter((x) => s.match(x)).length;
            return (
              <Link
                key={s.key}
                href={`${base}${buildQs(range.key, s.key, persona.key)}`}
                title={s.desc}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-caption font-medium transition-colors",
                  s.key === seg.key ? "border-fg bg-fg text-bg" : "border-line-strong text-muted hover:bg-fg/[0.04]"
                )}
              >
                {s.label} <span className="tabular-nums opacity-70">{fmt.format(n)}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* 페르소나 — 기본 구분과 독립적으로 교집합 적용 */}
      <div className="mt-3">
        <p className="mb-1.5 text-caption font-medium text-faint">페르소나 (별도 · 교집합)</p>
        <div className="flex flex-wrap gap-1.5">
          {PERSONAS.map((p) => {
            const n = allSessions.filter((x) => p.match(x)).length;
            return (
              <Link
                key={p.key}
                href={`${base}${buildQs(range.key, seg.key, p.key)}`}
                title={p.desc}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-caption font-medium transition-colors",
                  p.key === persona.key ? "border-brand bg-brand/[0.06] text-brand" : "border-line-strong text-muted hover:bg-fg/[0.04]"
                )}
              >
                {p.label} <span className="tabular-nums opacity-70">{fmt.format(n)}</span>
              </Link>
            );
          })}
          <span className="self-center text-caption text-faint">페르소나 확정 시 카테고리 추가 예정</span>
        </div>
      </div>

      {/* 탭 네비 */}
      <nav className="mt-5 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`${t.path}${qs}`}
            className={cn(
              "shrink-0 rounded-t-lg border-b-2 px-3.5 py-2 text-body-sm font-medium transition-colors",
              t.key === active
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-fg"
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

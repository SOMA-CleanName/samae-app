"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui";
import { formatDuration, formatSearchedAt, purposeLabel } from "@/lib/search-interpretation";
import type { SearchStatGroup, Tally } from "@/lib/search-stats";
import { RouteBadge } from "./InterpretationChips";

// 검색어 순위 — 검색어마다 **어느 목적 · 무드 가족으로 갔는지**를 함께 보여준다.
// 텍스트 필터(검색어 · 변형 · 무드 이름) + '결과0만' · '애매한 검색만' 토글 + 펼쳐서 자세히. (클라이언트 측)

function Counted({ items, max = 4, render }: { items: Tally[]; max?: number; render: (t: Tally) => React.ReactNode }) {
  const shown = items.slice(0, max);
  return (
    <>
      {shown.map((t) => (
        <span key={t.name}>{render(t)}</span>
      ))}
      {items.length > max && <span className="text-[11px] text-faint">외 {items.length - max}</span>}
    </>
  );
}

export function SearchStatsTable({ groups }: { groups: SearchStatGroup[] }) {
  const [q, setQ] = useState("");
  const [onlyZero, setOnlyZero] = useState(false);
  const [onlyBig, setOnlyBig] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return groups.filter((g) => {
      if (onlyZero && !g.zeroResult) return false;
      if (onlyBig && !g.routes.some((r) => r.name === "큰 무드 · 애매")) return false;
      if (!kw) return true;
      return (
        g.term.toLowerCase().includes(kw) ||
        g.variants.some((v) => v.raw.toLowerCase().includes(kw)) ||
        g.moods.some((m) => m.name.toLowerCase().includes(kw)) ||
        g.filled.some((m) => m.name.toLowerCase().includes(kw))
      );
    });
  }, [groups, q, onlyZero, onlyBig]);

  return (
    <div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색어 · 무드 이름으로 찾기"
          className="h-9 min-w-[160px] flex-1 rounded-lg border border-line-strong bg-surface px-3 text-body-sm outline-none transition-colors focus:border-fg/40"
        />
        <label className="flex items-center gap-1.5 text-body-sm text-muted">
          <input type="checkbox" checked={onlyZero} onChange={(e) => setOnlyZero(e.target.checked)} className="h-4 w-4" />
          결과0만
        </label>
        <label className="flex items-center gap-1.5 text-body-sm text-muted">
          <input type="checkbox" checked={onlyBig} onChange={(e) => setOnlyBig(e.target.checked)} className="h-4 w-4" />
          애매한 검색만
        </label>
      </div>

      <p className="mt-3 text-caption text-faint">{filtered.length}개 표시</p>

      {filtered.length === 0 ? (
        <p className="mt-4 text-body-sm text-muted">조건에 맞는 검색어가 없어요.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {filtered.map((g) => {
            const isOpen = open === g.compact;
            const topRoute = g.routes[0]?.name;
            return (
              <li key={g.compact} className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : g.compact)}
                  className="flex w-full min-w-0 items-center gap-3 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="min-w-0 truncate text-body-sm font-semibold text-fg">{g.term}</span>
                  {g.variants.length > 1 && (
                    <span className="shrink-0 text-caption text-faint">변형 {g.variants.length}</span>
                  )}
                  <span className="ml-auto flex shrink-0 items-center gap-3">
                    {g.zeroResult && <Badge tone="warning">결과0</Badge>}
                    <span className="tabular-nums text-caption text-muted">
                      횟수: <b className="text-fg">{g.count}</b>
                    </span>
                    <span className="tabular-nums text-caption text-faint">평균 {g.avgResults}장</span>
                    {g.avgMs !== null && (
                      <span className="tabular-nums text-caption text-faint">평균 {formatDuration(g.avgMs)}</span>
                    )}
                    <span className="hidden tabular-nums text-caption text-faint sm:inline">
                      마지막 {formatSearchedAt(g.lastSearchedAt)}
                    </span>
                    <span className="text-caption text-faint">{isOpen ? "▲" : "▾"}</span>
                  </span>
                </button>

                {/* 연결된 무드 — 한눈에 */}
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {topRoute && <RouteBadge label={topRoute} />}
                  <Counted
                    items={g.purposes}
                    render={(t) => (
                      <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] text-muted">
                        목적 {purposeLabel(t.name)}
                      </span>
                    )}
                  />
                  <Counted
                    items={g.moods}
                    max={5}
                    render={(t) => (
                      <span className="rounded-full bg-fg px-2 py-0.5 text-[11px] font-medium text-bg">
                        {t.name}
                        {g.count > 1 && <span className="ml-1 tabular-nums opacity-60">{t.count}</span>}
                      </span>
                    )}
                  />
                  {g.moods.length === 0 && g.moodTexts[0] && (
                    <span className="text-[11px] text-faint">무드 가족 없음 · 글자 「{g.moodTexts[0].name}」</span>
                  )}
                </div>

                {isOpen && (
                  <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-xl bg-fg/[0.03] p-3 text-caption">
                    <dt className="text-faint">마지막 검색</dt>
                    <dd className="tabular-nums text-muted">{formatSearchedAt(g.lastSearchedAt)}</dd>
                    <dt className="text-faint">걸린 시간</dt>
                    <dd className="tabular-nums text-muted">
                      {g.avgMs === null ? "— (0146 전 기록)" : `평균 ${formatDuration(g.avgMs)} · 최대 ${formatDuration(g.maxMs)}`}
                    </dd>
                    <dt className="text-faint">찾은 길</dt>
                    <dd className="text-muted">
                      {g.routes.map((r) => `${r.name} ${r.count}`).join(" · ")}
                    </dd>
                    <dt className="text-faint">무드 글자</dt>
                    <dd className="text-muted">
                      {g.moodTexts.length ? g.moodTexts.map((m) => `「${m.name}」 ${m.count}`).join(" · ") : "—"}
                    </dd>
                    <dt className="text-faint">잡힌 무드</dt>
                    <dd className="text-muted">
                      {g.moods.length ? g.moods.map((m) => `${m.name} ${m.count}`).join(" · ") : "—"}
                    </dd>
                    <dt className="text-faint">채운 무드</dt>
                    <dd className="text-muted">
                      {g.filled.length ? g.filled.map((m) => `${m.name} ${m.count}`).join(" · ") : "—"}
                    </dd>
                    <dt className="text-faint">표기 · 오타</dt>
                    <dd className="flex flex-wrap gap-1">
                      {g.variants.map((v) => (
                        <span key={v.raw} className="rounded-full bg-fg/[0.06] px-2 py-0.5 text-[11px] text-muted">
                          {v.raw} <span className="tabular-nums text-faint">×{v.count}</span>
                        </span>
                      ))}
                    </dd>
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

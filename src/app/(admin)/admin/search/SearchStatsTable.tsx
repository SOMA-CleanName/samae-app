"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui";
import type { SearchStatGroup } from "@/lib/search-stats";

// 인기 검색어 테이블 — 텍스트 필터 + '결과0만' 토글 + 변형(오타) 펼침. (클라이언트 측)
export function SearchStatsTable({ groups }: { groups: SearchStatGroup[] }) {
  const [q, setQ] = useState("");
  const [onlyZero, setOnlyZero] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return groups.filter((g) => {
      if (onlyZero && !g.zeroResult) return false;
      if (kw && !g.term.toLowerCase().includes(kw) && !g.variants.some((v) => v.raw.toLowerCase().includes(kw)))
        return false;
      return true;
    });
  }, [groups, q, onlyZero]);

  return (
    <div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색어 찾기"
          className="h-9 min-w-[140px] flex-1 rounded-lg border border-line-strong bg-surface px-3 text-body-sm outline-none transition-colors focus:border-fg/40"
        />
        <label className="flex items-center gap-1.5 text-body-sm text-muted">
          <input
            type="checkbox"
            checked={onlyZero}
            onChange={(e) => setOnlyZero(e.target.checked)}
            className="h-4 w-4 rounded border-fg/30"
          />
          결과0만
        </label>
      </div>

      <p className="mt-3 text-caption text-faint">{filtered.length}개 표시</p>

      {filtered.length === 0 ? (
        <p className="mt-4 text-body-sm text-muted">조건에 맞는 검색어가 없어요.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {filtered.map((g) => {
            const hasVariants = g.variants.length > 1;
            const isOpen = open === g.compact;
            return (
              <li key={g.compact} className="px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => hasVariants && setOpen(isOpen ? null : g.compact)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="min-w-0 truncate text-body-sm font-medium text-fg">{g.term}</span>
                    {hasVariants && (
                      <span className="shrink-0 text-caption text-faint">변형 {g.variants.length} {isOpen ? "▲" : "▾"}</span>
                    )}
                  </button>
                  {g.zeroResult && <Badge tone="warning">결과0</Badge>}
                  <span className="shrink-0 tabular-nums text-caption text-muted">
                    검색 <b className="text-fg">{g.count}</b>
                  </span>
                  <span className="shrink-0 tabular-nums text-caption text-faint">평균 {g.avgResults}</span>
                </div>

                {hasVariants && isOpen && (
                  <ul className="mt-2 flex flex-wrap gap-1.5 pl-1">
                    {g.variants.map((v) => (
                      <li
                        key={v.raw}
                        className="rounded-full bg-fg/[0.06] px-2 py-0.5 text-[11px] text-muted"
                      >
                        {v.raw} <span className="tabular-nums text-faint">×{v.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

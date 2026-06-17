"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui";
import type { TagUsage } from "@/lib/tags";

// 태그 빈도 테이블 — 검색 + ‘미매핑만’ 필터 (클라이언트 측).
export function TagTable({ tags }: { tags: TagUsage[] }) {
  const [q, setQ] = useState("");
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return tags.filter((t) => {
      if (onlyUnmapped && t.mapped) return false;
      if (kw && !t.tag.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [tags, q, onlyUnmapped]);

  return (
    <div>
      {/* 검색·필터 */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="태그 검색"
          className="h-9 min-w-[140px] flex-1 rounded-lg border border-line-strong bg-surface px-3 text-body-sm outline-none transition-colors focus:border-fg/40"
        />
        <label className="flex items-center gap-1.5 text-body-sm text-muted">
          <input
            type="checkbox"
            checked={onlyUnmapped}
            onChange={(e) => setOnlyUnmapped(e.target.checked)}
            className="h-4 w-4 rounded border-fg/30"
          />
          미매핑만
        </label>
      </div>

      <p className="mt-3 text-caption text-faint">{filtered.length}개 표시</p>

      {filtered.length === 0 ? (
        <p className="mt-4 text-body-sm text-muted">조건에 맞는 태그가 없어요.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {filtered.map((t) => (
            <li key={t.tag} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-fg">{t.tag}</span>
              {!t.mapped && <Badge tone="warning">미매핑</Badge>}
              <span className="shrink-0 tabular-nums text-caption text-muted">
                공개 <b className="text-fg">{t.publishedCount}</b>
              </span>
              <span className="shrink-0 tabular-nums text-caption text-faint">전체 {t.totalCount}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

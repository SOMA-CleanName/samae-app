"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { UNTAGGED_TOKEN } from "@/lib/category-constants";

// 카테고리 태그 선택 — 기존 태그 칩(다중선택) + 검색 좁히기 + 새 태그 추가.
// '태그 없는 사진 묶기(임시)' 체크 시 센티넬 태그만 제출(일반 태그 무시).
// 제출은 hidden input name="tags"(쉼표 구분)로 — 기존 서버 액션(parseTags) 그대로 사용.
export function CategoryFields({
  allTags,
  defaultTags = [],
}: {
  allTags: string[];
  defaultTags?: string[];
}) {
  const initUntagged = defaultTags.includes(UNTAGGED_TOKEN);
  const [untagged, setUntagged] = useState(initUntagged);
  const [selected, setSelected] = useState<string[]>(
    defaultTags.filter((t) => t !== UNTAGGED_TOKEN)
  );
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");

  const value = untagged ? UNTAGGED_TOKEN : selected.join(", ");

  // 기존 태그 + 사용자가 추가한(목록 밖) 선택 태그 합집합
  const pool = useMemo(() => {
    const set = new Set(allTags);
    for (const t of selected) set.add(t);
    return [...set];
  }, [allTags, selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool.filter((t) => !q || t.toLowerCase().includes(q));
  }, [pool, query]);

  function toggle(tag: string) {
    setSelected((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function addCustom() {
    const t = custom.trim();
    if (!t || t === UNTAGGED_TOKEN) return;
    if (!selected.includes(t)) setSelected((prev) => [...prev, t]);
    setCustom("");
    setQuery("");
  }

  return (
    <div>
      <input type="hidden" name="tags" value={value} />
      <span className="mb-1 block text-caption text-muted">태그</span>

      {/* 임시: 태그 없는 사진 묶기 */}
      <label className="mb-2 flex items-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface-2 px-3 py-2 text-caption">
        <input
          type="checkbox"
          checked={untagged}
          onChange={(e) => setUntagged(e.target.checked)}
          className="h-4 w-4 accent-fg"
        />
        <span className="text-fg">태그 없는 사진을 이 카테고리로 묶기 <span className="text-faint">(임시)</span></span>
      </label>

      {untagged ? (
        <p className="rounded-lg bg-fg/[0.04] px-3 py-2 text-caption text-muted">
          태그가 하나도 없는 공개 사진들이 이 카테고리에 묶여요.
        </p>
      ) : (
        <>
          {/* 선택된 태그 */}
          {selected.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {selected.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggle(t)}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-fg px-2.5 py-1 text-caption font-medium text-bg"
                >
                  {t}
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {/* 검색 + 새 태그 추가 */}
          <div className="flex gap-1.5">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="태그 검색 또는 새 태그 입력"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setCustom(query);
                  // 입력값이 목록에 정확히 있으면 토글, 없으면 새로 추가
                  const exact = pool.find((t) => t.toLowerCase() === query.trim().toLowerCase());
                  if (exact) toggle(exact);
                  else if (query.trim()) {
                    if (!selected.includes(query.trim())) setSelected((p) => [...p, query.trim()]);
                  }
                  setQuery("");
                  setCustom("");
                }
              }}
              className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 py-2 text-body-sm outline-none transition-colors focus:border-fg/40"
            />
            {query.trim() && !pool.some((t) => t.toLowerCase() === query.trim().toLowerCase()) && (
              <button
                type="button"
                onClick={() => { setCustom(query); addCustom(); }}
                className="shrink-0 cursor-pointer rounded-lg bg-fg/[0.06] px-3 py-2 text-caption font-medium text-fg transition-colors hover:bg-fg/10"
              >
                + 추가
              </button>
            )}
          </div>

          {/* 기존 태그 칩 목록 */}
          <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {filtered.length === 0 ? (
              <span className="text-caption text-faint">일치하는 태그가 없어요. 입력 후 “+ 추가”로 새로 만들 수 있어요.</span>
            ) : (
              filtered.map((t) => {
                const on = selected.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggle(t)}
                    className={cn(
                      "cursor-pointer rounded-full border px-2.5 py-1 text-caption font-medium transition-colors",
                      on
                        ? "border-fg bg-fg text-bg"
                        : "border-line-strong text-muted hover:bg-fg/[0.04]"
                    )}
                  >
                    {t}
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import type { GeneratedTagUsage } from "@/lib/tags";
import { deleteGeneratedTag, renameGeneratedTag } from "./actions";

// 숨김 태그(generated_tags) 관리 — 빈도 조회 + 이름변경·병합 + 전역 삭제. (클라이언트 측)
export function GeneratedTagTable({ tags }: { tags: GeneratedTagUsage[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return tags.filter((t) => !kw || t.tag.toLowerCase().includes(kw));
  }, [tags, q]);

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="숨김 태그 검색"
        className="mt-5 h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-body-sm outline-none transition-colors focus:border-fg/40"
      />

      <p className="mt-3 text-caption text-faint">{filtered.length}개 표시</p>

      {filtered.length === 0 ? (
        <p className="mt-4 text-body-sm text-muted">조건에 맞는 숨김 태그가 없어요.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {filtered.map((t) => {
            const isOpen = open === t.tag;
            return (
              <li key={t.tag} className="px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-fg">{t.tag}</span>
                  <span className="shrink-0 tabular-nums text-caption text-muted">
                    공개 <b className="text-fg">{t.publishedCount}</b>
                  </span>
                  <span className="shrink-0 tabular-nums text-caption text-faint">전체 {t.totalCount}</span>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : t.tag)}
                    className="shrink-0 rounded-md border border-line px-2 py-1 text-caption text-muted transition-colors hover:text-fg"
                  >
                    관리
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <form action={renameGeneratedTag} className="flex items-center gap-1.5">
                      <input type="hidden" name="from" value={t.tag} />
                      <input
                        name="to"
                        defaultValue={t.tag}
                        className="h-8 w-40 rounded-md border border-line-strong bg-bg px-2 text-body-sm outline-none focus:border-fg/40"
                      />
                      <button
                        type="submit"
                        className="h-8 rounded-md bg-fg px-3 text-caption font-medium text-bg"
                      >
                        이름변경·병합
                      </button>
                    </form>

                    <form
                      action={deleteGeneratedTag}
                      onSubmit={(e) => {
                        if (!confirm(`'${t.tag}' 숨김 태그를 모든 사진에서 삭제할까요?`)) e.preventDefault();
                      }}
                    >
                      <input type="hidden" name="tag" value={t.tag} />
                      <button
                        type="submit"
                        className="h-8 rounded-md border border-danger/40 px-3 text-caption font-medium text-danger transition-colors hover:bg-danger/[0.06]"
                      >
                        전역 삭제
                      </button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

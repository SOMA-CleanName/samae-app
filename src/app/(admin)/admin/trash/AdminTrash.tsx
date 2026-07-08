"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { restoreSelected } from "./actions";

export type TrashItem = { id: string; label: string };
export type TrashGroup = { key: string; at: string; byName: string; items: TrashItem[] };

const dtf = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

// 그룹 내 테이블별 건수 요약 — "거래 1 · 결제 1 · 수수료 1"
function summarize(items: TrashItem[]) {
  const c = new Map<string, number>();
  for (const it of items) c.set(it.label, (c.get(it.label) ?? 0) + 1);
  return [...c.entries()].map(([l, n]) => `${l} ${n}`).join(" · ");
}

export function AdminTrash({ groups }: { groups: TrashGroup[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();

  const toggle = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const toggleGroup = (ids: string[]) =>
    setSelected((p) => {
      const all = ids.every((i) => p.has(i));
      const n = new Set(p);
      ids.forEach((i) => (all ? n.delete(i) : n.add(i)));
      return n;
    });

  function restore(ids: string[]) {
    if (ids.length === 0) return;
    if (!window.confirm(`${ids.length}개 항목을 복구할까요?`)) return;
    setMsg(null);
    const fd = new FormData();
    fd.set("ids", JSON.stringify(ids));
    start(async () => {
      const r = await restoreSelected({}, fd);
      if (r.error) setMsg({ error: r.error });
      else {
        setMsg({ ok: `${ids.length}개 복구됐어요.` });
        setSelected(new Set());
      }
    });
  }

  const selectedIds = [...selected];

  return (
    <div className="mt-4 flex flex-col gap-3">
      {/* 선택 복구 바 */}
      {selectedIds.length > 0 && (
        <div className="sticky top-2 z-10 flex items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand/[0.06] px-4 py-2 backdrop-blur">
          <span className="text-caption font-medium text-fg">{selectedIds.length}개 선택됨</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => restore(selectedIds)}
              className="cursor-pointer rounded-full bg-brand px-3 py-1.5 text-caption font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "복구 중…" : "선택 복구"}
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="cursor-pointer rounded-full px-2 py-1.5 text-caption text-muted hover:text-fg"
            >
              해제
            </button>
          </div>
        </div>
      )}

      {msg?.error && <p className="text-caption text-danger">{msg.error}</p>}
      {msg?.ok && <p className="text-caption text-success">{msg.ok}</p>}

      {groups.map((g) => {
        const ids = g.items.map((i) => i.id);
        const allChecked = ids.every((i) => selected.has(i));
        return (
          <div key={g.key} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <label className="flex min-w-0 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={() => toggleGroup(ids)}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-brand"
                />
                <span className="truncate text-body-sm font-medium text-fg">
                  {dtf.format(new Date(g.at))} · {g.byName}
                </span>
              </label>
              <button
                type="button"
                disabled={pending}
                onClick={() => restore(ids)}
                className="shrink-0 cursor-pointer rounded-full border border-brand/50 px-3 py-1.5 text-caption font-semibold text-brand transition-colors hover:bg-brand/10 disabled:opacity-50"
              >
                이 작업 복구
              </button>
            </div>

            <p className="mt-1 pl-6 text-caption text-faint">{summarize(g.items)}</p>

            {/* 개별 선택 칩 */}
            <ul className="mt-2 flex flex-wrap gap-1.5 pl-6">
              {g.items.map((it, idx) => {
                const on = selected.has(it.id);
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => toggle(it.id)}
                      className={cn(
                        "cursor-pointer rounded-full border px-2.5 py-1 text-caption transition-colors",
                        on
                          ? "border-brand bg-brand/[0.08] font-medium text-brand"
                          : "border-line-strong text-muted hover:bg-fg/[0.04]"
                      )}
                    >
                      {it.label}
                      {g.items.filter((x) => x.label === it.label).length > 1 && (
                        <span className="ml-1 opacity-60">#{idx + 1}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

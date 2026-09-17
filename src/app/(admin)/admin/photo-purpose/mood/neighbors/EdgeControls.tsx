"use client";

import { useState } from "react";
import { editEdge } from "./actions";

/**
 * 간선 하나를 잇거나 끊는다. 왜 그랬는지 한 줄을 같이 받는다 —
 * 나중에 "이 간선 왜 끊었지" 가 반드시 생기고, 그때 기록이 없으면 다시 판단해야 한다.
 */
export function EdgeControls({ a, b, connected }: {
  a: string; b: string; connected: boolean;
}) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <span className="flex flex-wrap items-center gap-2">
      {open && (
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200}
          aria-label={`${a} 와 ${b} 를 고치는 이유`} placeholder="왜 그렇게 정했는지"
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-1.5 text-body-sm" />
      )}
      <button type="button" onClick={() => setOpen(!open)}
        className="rounded-xl px-2 py-1 text-caption text-muted underline hover:text-fg">
        {open ? "메모 접기" : "메모"}
      </button>
      <form action={editEdge} className="contents">
        <input type="hidden" name="a" value={a} />
        <input type="hidden" name="b" value={b} />
        <input type="hidden" name="note" value={note} />
        <button name="action" value={connected ? "remove" : "add"}
          className="rounded-xl border border-line px-3 py-1.5 text-body-sm hover:border-rose-500 hover:text-rose-700">
          {connected ? "끊기" : "잇기"}
        </button>
      </form>
    </span>
  );
}

/** 후보 밖의 무드와도 이을 수 있어야 한다 — 실제 검색에서 빠진 게 보이면 그 자리에서 잇는다. */
export function AddEdge({ head, heads }: { head: string; heads: string[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim();
  const found = needle
    ? heads.filter((h) => h !== head && h.includes(needle)).slice(0, 8)
    : [];
  return (
    <div className="mt-3 rounded-xl border border-line bg-fg/[0.02] p-3">
      <label className="block text-caption text-muted" htmlFor={`add-${head}`}>이웃 직접 잇기</label>
      <input id={`add-${head}`} value={q} onChange={(e) => setQ(e.target.value)} maxLength={40}
        placeholder="이을 무드를 검색하세요"
        className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-body-sm" />
      {found.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {found.map((name) => (
            <li key={name}>
              <form action={editEdge}>
                <input type="hidden" name="a" value={head} />
                <input type="hidden" name="b" value={name} />
                <button name="action" value="add"
                  className="rounded-lg border border-line px-2 py-1 text-caption hover:border-brand hover:text-brand">
                  + {name}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

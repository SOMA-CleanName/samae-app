"use client";

import { useState } from "react";
import { editTerm } from "./actions";

/**
 * 검색어 하나를 고치거나 버린다. 꼴만 틀린 경우가 대부분이라
 * (멍하니 → 멍한) 고쳐 쓰는 칸을 버리기보다 앞에 둔다.
 */
export function TermControls({ head, term }: { head: string; term: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <button type="button" onClick={() => setOpen(!open)}
        className="rounded-lg px-1.5 py-0.5 text-caption text-muted underline hover:text-fg">
        {open ? "접기" : "고치기"}
      </button>
      <form action={editTerm} className="contents">
        <input type="hidden" name="head" value={head} />
        <input type="hidden" name="term" value={term} />
        {open && (
          <>
            <input name="to" defaultValue={term} maxLength={20} aria-label={`${term} 를 바꿀 꼴`}
              className="w-28 rounded-lg border border-line bg-bg px-2 py-0.5 text-caption" />
            <button name="action" value="rename"
              className="rounded-lg border border-line px-2 py-0.5 text-caption hover:border-brand hover:text-brand">
              바꾸기
            </button>
          </>
        )}
        <button name="action" value="drop" aria-label={`${term} 버리기`}
          className="rounded-lg border border-line px-2 py-0.5 text-caption text-muted hover:border-rose-500 hover:text-rose-700">
          버리기
        </button>
      </form>
    </span>
  );
}

/** 흡수된 낱말을 다시 검색어로 올린다 — 모델이 잘못 삼킨 것을 되살리는 자리다. */
export function AddTerm({ head, dropped }: { head: string; dropped: string[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim();
  const found = needle ? dropped.filter((w) => w.includes(needle)).slice(0, 8) : dropped.slice(0, 8);
  if (!dropped.length) return null;
  return (
    <div className="mt-2 rounded-xl border border-line bg-fg/[0.02] p-2">
      <label className="block text-caption text-muted" htmlFor={`add-${head}`}>
        흡수된 낱말 되살리기 ({dropped.length})
      </label>
      {dropped.length > 8 && (
        <input id={`add-${head}`} value={q} onChange={(e) => setQ(e.target.value)} maxLength={20}
          placeholder="낱말 찾기"
          className="mt-1 w-full rounded-lg border border-line bg-bg px-2 py-1 text-caption" />
      )}
      <ul className="mt-1 flex flex-wrap gap-1">
        {found.map((word) => (
          <li key={word}>
            <form action={editTerm}>
              <input type="hidden" name="head" value={head} />
              <input type="hidden" name="term" value={word} />
              <button name="action" value="add"
                className="rounded-lg border border-line px-2 py-0.5 text-caption hover:border-brand hover:text-brand">
                + {word}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}

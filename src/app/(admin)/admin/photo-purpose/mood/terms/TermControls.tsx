"use client";

import Link from "next/link";
import { useState } from "react";
import { editTerm } from "./actions";

type Axis = { name: string; href: string; tone: string };

/**
 * 묶음 카드 하나. 평소에는 검색어만 보이고, 오른쪽 '수정' 을 눌러야
 * 고치기·버리기·되살리기가 뜬다 — 버튼이 칩마다 붙어 있으면 검색어가 안 읽힌다.
 */
export function TermCard({
  head, title, axes, usage, prompts, terms, dropped, madeUp,
}: {
  head: string;
  title: string;
  axes: Axis[];
  usage: string;
  prompts: string[];
  terms: string[];
  dropped: string[];
  madeUp: string[];
}) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <strong className="text-body font-semibold">{title}</strong>
        {axes.map((axis) => (
          <Link key={axis.name} href={axis.href}
            className={`rounded-lg border px-2 py-0.5 text-caption ${axis.tone}`}>{axis.name}</Link>
        ))}
        <button type="button" onClick={() => setEditing(!editing)} aria-expanded={editing}
          className={`ml-auto rounded-lg border px-3 py-1 text-caption ${
            editing ? "border-fg bg-fg text-bg" : "border-line text-muted hover:text-fg"}`}>
          {editing ? "완료" : "수정"}
        </button>
      </div>
      <p className="mt-1 text-body-sm text-muted">
        {usage}
        {prompts.length > 0 && <span className="text-caption"> · {prompts.join(" / ")}</span>}
      </p>

      <ul className="mt-3 flex flex-wrap items-center gap-2">
        {terms.map((term) => (
          <li key={term} className="flex items-center gap-2 rounded-xl border border-line px-3 py-1.5">
            <b className="text-body-sm font-medium">{term}</b>
            {editing && <TermControls head={head} term={term} />}
          </li>
        ))}
        {!terms.length && (
          <li className="text-body-sm text-rose-700">검색어가 하나도 없습니다 — 수정을 눌러 되살려 주세요.</li>
        )}
      </ul>

      {dropped.length > 0 && (
        <p className="mt-2 text-caption text-muted">흡수 {dropped.length}: {dropped.join(" · ")}</p>
      )}
      {madeUp.length > 0 && (
        <p className="mt-1 text-caption text-rose-700">모델이 지어내서 버림: {madeUp.join(" · ")}</p>
      )}
      {editing && <AddTerm head={head} dropped={dropped} />}
    </li>
  );
}

/**
 * 검색어 하나를 고치거나 버린다. 꼴만 틀린 경우가 대부분이라
 * (멍하니 → 멍한) 고쳐 쓰는 칸을 버리기보다 앞에 둔다.
 */
function TermControls({ head, term }: { head: string; term: string }) {
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
function AddTerm({ head, dropped }: { head: string; dropped: string[] }) {
  if (!dropped.length) return null;
  return (
    <div className="mt-2 rounded-xl border border-line bg-fg/[0.02] p-2">
      <p className="text-caption text-muted">흡수된 낱말 되살리기 ({dropped.length})</p>
      <ul className="mt-1 flex flex-wrap gap-1">
        {dropped.map((word) => (
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

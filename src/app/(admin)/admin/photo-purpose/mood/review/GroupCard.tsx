"use client";

import { useState } from "react";
import { recordNote, recordVerdict } from "./actions";

type Sense = { label: string; pos: string; level: number; senses: string[] };
type Verdict = { status?: string; head?: string; note?: string };

const LEVELS = ["초급", "중급", "고급", "없음"];
const LEVEL_TONE = ["bg-brand/15 text-brand", "bg-fg/10 text-fg", "bg-fg/5 text-muted", "bg-fg/5 text-muted"];
const BADGE: Record<string, { label: string; tone: string }> = {
  ok: { label: "확인", tone: "border-brand bg-brand/10 text-brand" },
  head: { label: "대표 변경", tone: "border-amber-500 bg-amber-500/10 text-amber-700" },
  split: { label: "쪼개기", tone: "border-rose-500 bg-rose-500/10 text-rose-700" },
  drop: { label: "버림", tone: "border-line bg-fg/5 text-muted" },
};

export function GroupCard({
  head, members, prompts, senses, verdict,
}: {
  head: string;
  members: string[];
  prompts: string[];
  senses: Record<string, Sense>;
  verdict?: Verdict;
}) {
  const [open, setOpen] = useState(false);
  const saved = verdict?.note ?? "";
  const [note, setNote] = useState(saved);
  const words = [head, ...members];
  const shown = verdict?.status === "head" && verdict.head ? verdict.head : head;
  const badge = verdict?.status ? BADGE[verdict.status] : null;
  const dirty = note.trim() !== saved;

  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <strong className="text-body font-semibold">{shown}</strong>
        <span className={`rounded-lg px-2 py-0.5 text-caption ${LEVEL_TONE[senses[shown]?.level ?? 3]}`}>
          {LEVELS[senses[shown]?.level ?? 3]}
        </span>
        <span className="text-caption text-muted">식구 {members.length}</span>
        <span className="text-caption text-muted">· {prompts.join(" / ")}</span>
        {badge && <span className={`ml-auto rounded-lg border px-2 py-0.5 text-caption ${badge.tone}`}>{badge.label}</span>}
      </div>

      {verdict?.status === "head" && verdict.head && (
        <p className="mt-1 text-caption text-muted">자동 선정은 <b>{head}</b> 였습니다.</p>
      )}

      <p className="mt-2 text-body-sm text-muted">
        {members.length ? members.join(" · ") : "홀로 있는 낱말입니다."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <form action={recordVerdict} className="contents">
          <input type="hidden" name="key" value={head} />
          <input type="hidden" name="note" value={note} />
          <button name="status" value="ok" className="rounded-xl border border-line px-3 py-1.5 text-body-sm hover:border-brand hover:text-brand">
            확인
          </button>
          <button name="status" value="split" className="rounded-xl border border-line px-3 py-1.5 text-body-sm hover:border-rose-500 hover:text-rose-700">
            쪼개기
          </button>
          <button name="status" value="drop" className="rounded-xl border border-line px-3 py-1.5 text-body-sm hover:border-fg">
            버림
          </button>
        </form>
        <button type="button" onClick={() => setOpen(!open)}
          className="rounded-xl border border-line px-3 py-1.5 text-body-sm text-muted hover:text-fg">
          {open ? "접기" : "뜻풀이·대표 바꾸기"}
        </button>
        {verdict?.status && (
          <form action={recordVerdict}>
            <input type="hidden" name="key" value={head} />
            <input type="hidden" name="clear" value="1" />
            <button name="status" value="ok" className="rounded-xl px-3 py-1.5 text-body-sm text-muted underline hover:text-fg">
              판정 지우기
            </button>
          </form>
        )}
      </div>

      {open && (
        <div className="mt-4 rounded-xl border border-line bg-fg/[0.02] p-3">
          <p className="text-caption text-muted">대표로 세울 낱말을 고르세요. 뜻풀이는 첫 두 개만 보입니다.</p>
          <ul className="mt-2 space-y-1">
            {words.map((word) => (
              <li key={word} className="flex flex-wrap items-baseline gap-2 border-b border-line py-1.5 last:border-0">
                <form action={recordVerdict} className="contents">
                  <input type="hidden" name="key" value={head} />
                  <input type="hidden" name="head" value={word} />
                  <input type="hidden" name="note" value={note} />
                  <button name="status" value="head" disabled={word === shown}
                    className={`rounded-lg border px-2 py-0.5 text-caption ${
                      word === shown ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:border-brand hover:text-brand"}`}>
                    {word === shown ? "대표" : "대표로"}
                  </button>
                </form>
                <span className="font-medium">{word}</span>
                <span className="text-caption text-muted">
                  {senses[word]?.pos} · {LEVELS[senses[word]?.level ?? 3]}
                </span>
                <span className="w-full text-caption text-muted sm:w-auto sm:flex-1">
                  {(senses[word]?.senses ?? []).slice(0, 2).join(" / ") || "뜻풀이 없음"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 피드백은 판정과 따로 저장한다 — 판정 버튼을 다시 눌러 상태를 덮지 않아도 한 줄 덧붙일 수 있다. */}
      <form action={recordNote} className="mt-3 flex items-center gap-2">
        <input type="hidden" name="key" value={head} />
        <input name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300}
          aria-label={`${shown} 묶음 피드백`} placeholder="피드백 — 걸리는 점이나 왜 그렇게 봤는지"
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-body-sm" />
        <button disabled={!dirty}
          className={`shrink-0 rounded-xl px-4 py-2 text-body-sm ${
            dirty ? "bg-fg text-bg" : "border border-line text-muted"}`}>
          {dirty ? "저장" : saved ? "저장됨" : "저장"}
        </button>
      </form>
    </li>
  );
}

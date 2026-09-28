"use client";

// 문장 다듬기 — 전/후를 나란히 놓고 카드마다 사람이 고른다.
//
// 한 번에 전부 적용하는 버튼을 크게 두지 않은 이유: 다듬기는 **사실을 못 건드리는**
// 작업인데, 문장을 줄이다 보면 조건이 같이 사라진다. 자동 검사가 걸러내긴 하지만
// 검사가 못 잡는 종류(뉘앙스가 뒤집히는 경우)가 남는다. 그래서 기본은 눈으로 보고
// 고르는 것이고, "문제없는 것만 한꺼번에" 는 검사를 통과한 카드에만 적용된다.

import { useState, useTransition } from "react";
import { polishKbCards } from "./actions";

type Polished = {
  id: string;
  before: string;
  after: string;
  note?: string;
  dropped?: string;
  problems: string[];
};

export function KbPolishPanel({
  cards,
  onApply,
}: {
  cards: { id: string; topic: string; body: string }[];
  /** 고른 카드만 본문을 바꿔달라고 부모에게 알린다 */
  onApply: (next: { id: string; body: string }[]) => void;
}) {
  const [busy, startPolish] = useTransition();
  const [result, setResult] = useState<Polished[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);

  const run = () => {
    setError(null);
    setDone([]);
    startPolish(async () => {
      const r = await polishKbCards(cards);
      if (r.error) setError(r.error);
      setResult(r.polished.filter((p) => p.before !== p.after));
    });
  };

  const changed = result ?? [];
  const clean = changed.filter((p) => p.problems.length === 0 && !done.includes(p.id));

  const apply = (picks: Polished[]) => {
    if (picks.length === 0) return;
    onApply(picks.map((p) => ({ id: p.id, body: p.after })));
    setDone((d) => [...d, ...picks.map((p) => p.id)]);
  };

  return (
    <div className="mt-3 rounded-2xl border border-line bg-bg p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-body-sm font-semibold">문장 다듬기</p>
        <span className="text-caption text-faint">
          사실은 그대로 두고 말투만 고쳐요 · 안내 이미지에 이 문장이 그대로 실립니다
        </span>
        <button
          type="button"
          onClick={run}
          disabled={busy || cards.length === 0}
          className="ml-auto cursor-pointer rounded-lg border border-line px-3 py-1.5 text-caption font-semibold transition-colors hover:bg-fg/[0.05] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "다듬는 중…" : result ? "다시 다듬기" : "문장 다듬기"}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-caption text-danger-ink">{error}</p>
      )}

      {result && changed.length === 0 && !error && (
        <p className="mt-3 text-caption text-muted">고칠 곳이 없어요. 지금 문장 그대로 두면 됩니다.</p>
      )}

      {changed.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-caption text-muted">
              {changed.length}장 제안 · 적용 {done.length}장
            </span>
            {clean.length > 0 && (
              <button
                type="button"
                onClick={() => apply(clean)}
                className="cursor-pointer rounded-lg bg-fg px-3 py-1.5 text-caption font-semibold text-bg transition-opacity hover:opacity-90"
              >
                검사 통과한 {clean.length}장 한꺼번에 적용
              </button>
            )}
          </div>

          <ul className="mt-3 flex flex-col gap-3">
            {changed.map((p) => {
              const applied = done.includes(p.id);
              return (
                <li
                  key={p.id}
                  className={
                    "rounded-xl border p-3 " +
                    (p.problems.length > 0 ? "border-danger-ink/40 bg-danger-soft/30" : "border-line")
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-caption text-faint">{p.id}</code>
                    {p.problems.length > 0 && (
                      <span className="rounded-full bg-danger-soft px-2 py-0.5 text-caption font-semibold text-danger-ink">
                        사실이 바뀐 것 같아요
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => apply([p])}
                      disabled={applied}
                      className="ml-auto cursor-pointer rounded-lg border border-line px-3 py-1 text-caption font-semibold transition-colors hover:bg-fg/[0.05] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {applied ? "적용함" : "이 문장으로"}
                    </button>
                  </div>

                  <p className="mt-2 text-caption text-faint line-through decoration-faint/50">{p.before}</p>
                  <p className="mt-1 text-body-sm">{p.after}</p>

                  {p.dropped && (
                    <p className="mt-1.5 text-caption text-muted">
                      뺀 내용 · <span className="text-faint">{p.dropped}</span>
                    </p>
                  )}
                  {p.problems.length > 0 && (
                    <p className="mt-1.5 text-caption text-danger-ink">
                      {p.problems.join(" · ")} — 맞는지 직접 보고 고르세요
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

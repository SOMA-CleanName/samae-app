"use client";

import { useActionState } from "react";
import { runSearchDebug, type DebugState } from "./actions";

const INITIAL: DebugState = { ran: false, q: "", data: null };

// 미니 검색 디버그 — 입력어를 실제 엔진으로 채점해 사진별 총점·필드별 기여도를 본다.
export function SearchDebug() {
  const [state, action, pending] = useActionState(runSearchDebug, INITIAL);
  const data = state.data;

  return (
    <div>
      <form action={action} className="mt-4 flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={state.q}
          placeholder="검색어로 점수 확인 (예: 감성 강릉)"
          className="h-9 min-w-[180px] flex-1 rounded-lg border border-line-strong bg-surface px-3 text-body-sm outline-none transition-colors focus:border-fg/40"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-9 shrink-0 rounded-lg bg-fg px-4 text-body-sm font-medium text-bg transition-opacity disabled:opacity-50"
        >
          {pending ? "채점 중…" : "채점"}
        </button>
      </form>

      {state.error && <p className="mt-3 text-body-sm text-danger">{state.error}</p>}

      {data && (
        <>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
            <span>
              매칭 <b className="text-fg">{data.total}</b>장
            </span>
            <span>
              검색어 <b className="text-fg">{data.query.terms.join(", ") || "—"}</b>
            </span>
            {data.query.initials.length > 0 && <span>초성 {data.query.initials.join(", ")}</span>}
          </div>

          {data.results.length === 0 ? (
            <p className="mt-4 text-body-sm text-muted">매칭된 사진이 없어요.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.results.map((r) => (
                <li key={r.photo.id} className="flex gap-3 rounded-xl border border-line bg-surface p-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.photo.thumb_url ?? r.photo.src_url}
                    alt=""
                    loading="lazy"
                    className="h-16 w-16 shrink-0 rounded-md object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="tabular-nums text-body-sm font-semibold text-brand">{r.score}</span>
                      <span className="truncate text-caption text-muted">{r.photo.display_name ?? "작가"}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.breakdown.map((b) => (
                        <span
                          key={b.label}
                          className="rounded bg-fg/[0.06] px-1.5 py-0.5 text-[11px] text-muted"
                        >
                          {b.label} <b className="tabular-nums text-fg">+{b.score}</b>
                        </span>
                      ))}
                    </div>
                    {(r.photo.mood_tags.length > 0 || r.photo.generated_tags.length > 0) && (
                      <p className="mt-1 truncate text-[11px] text-faint">
                        {r.photo.mood_tags.join(" · ")}
                        {r.photo.generated_tags.length > 0 && (
                          <span className="text-faint"> ⟨{r.photo.generated_tags.join(" · ")}⟩</span>
                        )}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

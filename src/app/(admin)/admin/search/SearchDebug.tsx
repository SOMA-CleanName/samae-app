"use client";

import { useActionState } from "react";
import { runSearchDebug, type DebugState } from "./actions";
import { InterpretationChips } from "./InterpretationChips";
import { formatDuration } from "@/lib/search-interpretation";

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
          placeholder="검색어로 해석 · 점수 확인 (예: 가을 감성 커플)"
          className="h-9 min-w-[180px] flex-1 rounded-lg border border-line-strong bg-surface px-3 text-body-sm outline-none transition-colors focus:border-fg/40"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-9 shrink-0 rounded-lg bg-fg px-4 text-body-sm font-medium text-bg transition-opacity disabled:opacity-50"
        >
          {pending ? "확인 중…" : "확인"}
        </button>
      </form>

      {state.error && <p className="mt-3 text-body-sm text-danger-ink">{state.error}</p>}

      {/* ① 실제 검색 길로 해석 — 홈 검색과 같은 searchPhotos */}
      {state.ran && (
        <div className="mt-4 rounded-xl border border-line bg-surface p-3">
          <p className="text-caption font-semibold text-muted">실제 검색 해석</p>
          {state.live ? (
            <>
              <div className="mt-1.5">
                <InterpretationChips interpretation={state.live.interpretation} />
              </div>
              <p className="mt-2 text-caption text-muted">
                결과 <b className="text-fg">{state.live.matches}</b>장 · 걸린 시간{" "}
                <b className="text-fg">{formatDuration(state.live.durationMs)}</b>
                {state.live.related > 0 && <> · 비슷한 무드 {state.live.related}장</>}
                {state.live.suggestions.length > 0 && (
                  <span className="text-faint"> · 연관 검색어 {state.live.suggestions.slice(0, 6).join(", ")}</span>
                )}
              </p>
              {state.live.sample.length > 0 && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto">
                  {state.live.sample.map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p.id} src={p.url} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-md object-cover" />
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="mt-1.5 text-caption text-warning-ink">
              해석을 받지 못했어요{state.liveError ? ` — ${state.liveError}` : ""}. 검색어 분리는 맥미니 서버가 해요(docs/28 §8).
            </p>
          )}
        </div>
      )}

      {data && (
        <>
          <p className="mt-5 text-caption font-semibold text-muted">태그 점수 (예전 채점)</p>
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
                      <span className="tabular-nums text-body-sm font-semibold text-brand-ink">{r.score}</span>
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

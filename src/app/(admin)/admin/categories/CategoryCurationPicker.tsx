"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { setCategoryCurationPhotos } from "./actions";

export type CurationCandidate = { id: string; thumb_url: string | null; src_url: string };

const SLOTS = 3;

// '오늘의 큐레이션' 사진 지정 — 타겟(촬영 종류)당 3장.
// 탐색탭 상단 캐러셀에 이 순서 그대로 나간다. 3장 미만이면 담긴 사진으로 자동 채움.
export function CategoryCurationPicker({
  categoryId,
  slug,
  candidates,
  selected,
}: {
  categoryId: string;
  slug: string;
  candidates: CurationCandidate[];
  selected: string[];
}) {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const [picked, setPicked] = useState<string[]>(selected.filter((id) => byId.has(id)));

  function toggle(id: string) {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= SLOTS) return prev; // 3장 초과 선택 방지
      return [...prev, id];
    });
  }

  return (
    <form action={setCategoryCurationPhotos} className="mt-3">
      <input type="hidden" name="id" value={categoryId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="photoIds" value={picked.join(",")} />

      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-fg/70">
          오늘의 큐레이션 <span className="text-fg/45">· 탐색탭 상단 3장</span>
        </p>
        <span className="rounded-full bg-fg/[0.06] px-2 py-0.5 text-[11px] tabular-nums text-fg/60">
          {picked.length} / {SLOTS}
        </span>
        <SaveButton />
      </div>

      {/* 선택 순서 미리보기 — 캐러셀에 나가는 순서 그대로 */}
      {picked.length > 0 && (
        <div className="mt-2 flex gap-1.5">
          {picked.map((id, i) => {
            const p = byId.get(id);
            return (
              <span key={id} className="relative">
                <img
                  src={p?.thumb_url ?? p?.src_url}
                  alt=""
                  className="h-14 w-14 rounded-lg object-cover"
                />
                <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-black/70 text-[10px] font-bold text-white">
                  {i + 1}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {candidates.length === 0 ? (
        <p className="mt-2 text-xs text-fg/45">
          이 타겟에 담긴 사진이 없어요. 작가가 포트폴리오에서 이 종류를 선택하면 후보가 생깁니다.
        </p>
      ) : (
        <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-xl bg-fg/[0.03] p-2">
          {candidates.map((c) => {
            const idx = picked.indexOf(c.id);
            const on = idx >= 0;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                aria-pressed={on}
                className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg ring-offset-2 transition-all ${
                  on ? "ring-2 ring-brand" : "opacity-80 hover:opacity-100"
                }`}
              >
                <img
                  src={c.thumb_url ?? c.src_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
                {on && (
                  <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">
                    {idx + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="ml-auto h-7 rounded-full bg-fg px-3 text-xs font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "저장 중…" : "저장"}
    </button>
  );
}

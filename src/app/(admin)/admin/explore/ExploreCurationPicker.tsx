"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { loadTargetCoverCandidates, setExploreCuration, type PreviewCandidate } from "./actions";

const SLOTS = 3;

// 오늘의 큐레이션 3컷 — 탐색탭 상단 캐러셀에서 이 무드 슬라이드에 나가는 사진.
// 지정하면 그 순서 그대로, 비워두면 타일 대표 사진 → 담긴 순으로 자동 채워진다.
export function ExploreCurationPicker({
  categoryId,
  curationPhotoIds,
}: {
  categoryId: string;
  curationPhotoIds: string[];
}) {
  const [picked, setPicked] = useState<string[]>(curationPhotoIds);
  const [cands, setCands] = useState<PreviewCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const byId = new Map((cands ?? []).map((c) => [c.id, c]));
  const src = (p: PreviewCandidate) => p.thumb_url ?? p.src_url;

  async function ensureCands() {
    if (cands) return;
    setLoading(true);
    try {
      setCands(await loadTargetCoverCandidates(categoryId));
    } finally {
      setLoading(false);
    }
  }

  async function toggle(id: string) {
    const next = picked.includes(id)
      ? picked.filter((x) => x !== id)
      : picked.length >= SLOTS
        ? picked // 3장 초과 방지 — 빼고 다시 고르게
        : [...picked, id];
    if (next === picked) return;
    setPicked(next);
    setSaving(true);
    try {
      await setExploreCuration(categoryId, next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="mt-3" onToggle={(e) => e.currentTarget.open && void ensureCands()}>
      <summary className="cursor-pointer text-caption font-medium text-fg">
        ✨ 오늘의 큐레이션 3컷
        {picked.length > 0 ? (
          <span className="ml-1 text-brand">· {picked.length}장 지정</span>
        ) : (
          <span className="ml-1 text-muted">· 자동</span>
        )}
        {saving && <span className="ml-1 text-muted">저장 중…</span>}
      </summary>

      <p className="mt-1.5 text-caption text-muted">
        탐색탭 상단 캐러셀의 이 무드 슬라이드에 이 순서대로 나가요. 비워두면 타일 대표 사진 →
        담긴 순으로 자동 채웁니다.
      </p>

      {/* 지정한 순서 미리보기 */}
      {picked.length > 0 && (
        <div className="mt-2 flex gap-1.5">
          {picked.map((id, i) => {
            const p = byId.get(id);
            return (
              <span key={id} className="relative">
                {p ? (
                  <img src={src(p)} alt="" className="h-14 w-14 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-14 w-14 place-items-center rounded-lg bg-fg/[0.06] text-[10px] text-muted">
                    ?
                  </span>
                )}
                <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-black/70 text-[10px] font-bold text-white">
                  {i + 1}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {loading ? (
        <p className="mt-2 text-caption text-muted">후보 불러오는 중…</p>
      ) : (cands ?? []).length === 0 ? (
        <p className="mt-2 text-caption text-muted">
          이 무드에 담긴 사진이 없어요. 사진을 먼저 담아주세요.
        </p>
      ) : (
        <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-xl bg-fg/[0.03] p-2">
          {(cands ?? []).map((p) => {
            const idx = picked.indexOf(p.id);
            const on = idx >= 0;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => void toggle(p.id)}
                aria-pressed={on}
                className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg transition-all ${
                  on ? "ring-2 ring-brand ring-offset-2" : "opacity-80 hover:opacity-100"
                }`}
              >
                <img src={src(p)} alt="" className="h-full w-full object-cover" />
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
    </details>
  );
}

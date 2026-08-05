"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import {
  loadTargetCoverCandidates,
  setExploreCoverTarget,
  type PreviewCandidate,
} from "./actions";

export type TargetLite = { id: string; name: string };

// 추천 무드 '타일' 대표 사진 — 타겟(촬영 종류)별로 다른 컷을 걸 수 있다.
// 탐색탭 타일 + 그 무드로 진입했을 때의 첫 장이 이 사진이다.
// 미지정이면 '피드 상단 고정 순서' 1번 → 담긴 첫 장 순으로 폴백.
export function ExploreTargetCoverPicker({
  categoryId,
  targets,
  coverByTarget,
}: {
  categoryId: string;
  targets: TargetLite[];
  coverByTarget: Record<string, string>;
}) {
  const [active, setActive] = useState<string>(targets[0]?.id ?? "");
  const [covers, setCovers] = useState<Record<string, string>>(coverByTarget);
  const [cands, setCands] = useState<PreviewCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const setCount = Object.keys(covers).filter((k) => covers[k]).length;
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

  async function pick(photoId: string) {
    if (!active) return;
    const next = covers[active] === photoId ? null : photoId;
    setCovers((prev) => {
      const c = { ...prev };
      if (next) c[active] = next;
      else delete c[active];
      return c;
    });
    setSaving(true);
    try {
      await setExploreCoverTarget(categoryId, active, next);
    } finally {
      setSaving(false);
    }
  }

  if (targets.length === 0) {
    return (
      <p className="mt-2 text-caption text-muted">
        이 무드가 연결된 타겟이 없어요. 카테고리 관리에서 먼저 연결해주세요.
      </p>
    );
  }

  return (
    <details className="mt-3" onToggle={(e) => e.currentTarget.open && void ensureCands()}>
      <summary className="cursor-pointer text-caption font-medium text-fg">
        🖼 추천 무드 타일 대표 사진
        {setCount > 0 && <span className="ml-1 text-brand">· {setCount}개 타겟 지정됨</span>}
        {saving && <span className="ml-1 text-muted">저장 중…</span>}
      </summary>

      {/* 타겟 탭 */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {targets.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={`h-7 rounded-full px-3 text-caption font-medium transition-colors ${
                on ? "bg-fg text-bg" : "bg-fg/[0.06] text-fg/70 hover:bg-fg/[0.1]"
              }`}
            >
              {t.name}
              {covers[t.id] && <span className="ml-1 text-brand">●</span>}
            </button>
          );
        })}
      </div>

      <p className="mt-1.5 text-caption text-muted">
        탐색탭 타일과 진입 첫 장에 쓰여요. 지정하지 않으면 ‘피드 상단 고정 순서’ 1번 사진이
        대신 쓰입니다.
      </p>
      {loading ? (
        <p className="mt-2 text-caption text-muted">후보 불러오는 중…</p>
      ) : (cands ?? []).length === 0 ? (
        <p className="mt-2 text-caption text-muted">
          이 무드에 담긴 사진이 없어요. 작가 포트폴리오 선택이나 사진 담기가 먼저 필요합니다.
        </p>
      ) : (
        <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-xl bg-fg/[0.03] p-2">
          {(cands ?? []).map((p) => {
            const on = covers[active] === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => void pick(p.id)}
                aria-pressed={on}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg transition-all ${
                  on ? "ring-2 ring-brand ring-offset-2" : "opacity-80 hover:opacity-100"
                }`}
              >
                <img src={src(p)} alt="" className="h-full w-full object-cover" />
              </button>
            );
          })}
        </div>
      )}
    </details>
  );
}

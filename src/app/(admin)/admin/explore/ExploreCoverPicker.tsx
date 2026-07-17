"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { PURPOSE_OPTIONS } from "@/lib/taste-purposes";
import { loadCoverCandidates, setExploreCover, type PreviewCandidate } from "./actions";

// 무드 카테고리의 목적별 대표 사진 — 취향 테스트 스와이프 카드(목적마다 다른 사진).
// 목적 탭(웨딩/커플/개인)을 고르고, 그 목적의 후보 사진(무드∩목적) 중 대표 1장 택.
export function ExploreCoverPicker({
  categoryId,
  coverByPurpose,
}: {
  categoryId: string;
  coverByPurpose: Record<string, string>;
}) {
  const [active, setActive] = useState<string>(PURPOSE_OPTIONS[0]?.key ?? "");
  const [covers, setCovers] = useState<Record<string, string>>(coverByPurpose);
  const [candByPurpose, setCandByPurpose] = useState<Record<string, PreviewCandidate[]>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const cands = candByPurpose[active] ?? [];
  const src = (p: PreviewCandidate) => p.thumb_url ?? p.src_url;
  const setCount = Object.keys(covers).filter((k) => covers[k]).length;

  async function ensureCands(purposeKey: string) {
    if (candByPurpose[purposeKey]) return;
    setLoading(true);
    try {
      const list = await loadCoverCandidates(categoryId, purposeKey);
      setCandByPurpose((prev) => ({ ...prev, [purposeKey]: list }));
    } finally {
      setLoading(false);
    }
  }

  function onToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    if (e.currentTarget.open) void ensureCands(active);
  }

  function selectPurpose(key: string) {
    setActive(key);
    void ensureCands(key);
  }

  async function pick(photoId: string) {
    const next = covers[active] === photoId ? null : photoId;
    setCovers((prev) => {
      const c = { ...prev };
      if (next) c[active] = next;
      else delete c[active];
      return c;
    });
    setSaving(true);
    try {
      await setExploreCover(categoryId, active, next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="mt-3" onToggle={onToggle}>
      <summary className="cursor-pointer text-caption font-medium text-fg">
        🏷 목적별 대표 사진 (무드 테스트)
        <span className="ml-1 text-brand">
          · {setCount}/{PURPOSE_OPTIONS.length} 지정
        </span>
        {saving && <span className="ml-1 text-muted">저장 중…</span>}
      </summary>

      {/* 목적 탭 */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PURPOSE_OPTIONS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => selectPurpose(p.key)}
            className={
              "rounded-full border px-3 py-1 text-caption font-medium transition-colors " +
              (active === p.key
                ? "border-brand bg-brand text-white"
                : "border-line-strong bg-surface text-fg hover:bg-fg/[0.04]")
            }
          >
            {p.label}
            {covers[p.key] ? " ✓" : ""}
          </button>
        ))}
      </div>

      <p className="mt-2 text-caption text-muted">
        <b className="text-fg">{PURPOSE_OPTIONS.find((p) => p.key === active)?.label}</b> 대표 사진을
        골라주세요. (이 무드에 담긴 사진 중 해당 목적 사진)
      </p>

      {loading ? (
        <p className="mt-2 text-caption text-muted">불러오는 중…</p>
      ) : cands.length === 0 ? (
        <p className="mt-2 text-caption text-muted">
          후보 사진이 없어요. 이 무드와 목적 카테고리에 같은 사진을 담아주세요.
        </p>
      ) : (
        <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {cands.map((p) => {
            const on = covers[active] === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p.id)}
                className={
                  "relative aspect-square overflow-hidden rounded-lg bg-surface-2 ring-1 transition-all active:scale-[0.97] " +
                  (on ? "ring-2 ring-brand" : "ring-line")
                }
              >
                <img src={src(p)} alt="" className="h-full w-full object-cover" loading="lazy" />
                {on && (
                  <span className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-brand text-xs font-bold text-white">
                    ★
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

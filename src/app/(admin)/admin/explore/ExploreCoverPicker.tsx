"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import {
  loadExploreCategoryMembers,
  setExploreCover,
  type PreviewCandidate,
} from "./actions";

// 무드 카테고리 대표 사진 — 취향 테스트 스와이프 카드에 쓰는 1장. 담긴 사진 중에서 택1.
// 펼칠 때 멤버를 lazy 로드. 사진 탭 = 대표 지정(즉시 저장), 다시 탭 = 해제.
export function ExploreCoverPicker({
  categoryId,
  coverPhotoId,
}: {
  categoryId: string;
  coverPhotoId: string | null;
}) {
  const [members, setMembers] = useState<PreviewCandidate[]>([]);
  const [cover, setCover] = useState<string | null>(coverPhotoId);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const src = (p: PreviewCandidate) => p.thumb_url ?? p.src_url;

  async function onToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    if (e.currentTarget.open && !loaded) {
      setLoaded(true);
      setLoading(true);
      try {
        setMembers(await loadExploreCategoryMembers(categoryId));
      } finally {
        setLoading(false);
      }
    }
  }

  async function pick(id: string) {
    const next = cover === id ? null : id; // 같은 사진 다시 = 해제
    setCover(next);
    setSaving(true);
    try {
      await setExploreCover(categoryId, next);
    } catch {
      setCover(cover); // 실패 롤백
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="mt-3" onToggle={onToggle}>
      <summary className="cursor-pointer text-caption font-medium text-fg">
        🏷 대표 사진 (무드 테스트)
        {cover && <span className="ml-1 text-brand">· 지정됨</span>}
        {saving && <span className="ml-1 text-muted">저장 중…</span>}
      </summary>

      <p className="mt-2 text-caption text-muted">
        취향 테스트 스와이프 카드에 쓰는 대표 1장. (무드 카테고리만 사용)
      </p>

      {loading ? (
        <p className="mt-2 text-caption text-muted">불러오는 중…</p>
      ) : members.length === 0 ? (
        <p className="mt-2 text-caption text-muted">
          담긴 사진이 없어요. 먼저 사진에 카테고리를 지정하세요.
        </p>
      ) : (
        <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {members.map((p) => {
            const on = cover === p.id;
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

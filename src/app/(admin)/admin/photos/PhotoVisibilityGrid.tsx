"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react";
import { setPhotoFeedHidden, setAlbumFeedHidden } from "./actions";

export type AdminPhoto = {
  id: string;
  thumb_url: string | null;
  src_url: string;
  albumId: string | null;
  albumTitle: string | null;
  photographer: string | null;
  hidden: boolean;
};

type Filter = "all" | "hidden" | "visible";

// 사진 노출 관리 그리드 — 포트폴리오(앨범)별로 묶어 보여주고, 사진을 탭해 숨김/해제.
// 낙관적 업데이트(즉시 반영) 후 서버액션. 실패하면 되돌린다.
export function PhotoVisibilityGrid({ photos: initial }: { photos: AdminPhoto[] }) {
  const [photos, setPhotos] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [who, setWho] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const hiddenCount = useMemo(() => photos.filter((p) => p.hidden).length, [photos]);
  const photographers = useMemo(
    () => [...new Set(photos.map((p) => p.photographer).filter((v): v is string => !!v))].sort(),
    [photos]
  );

  // 필터 → 포트폴리오별 그룹 (등장 순서 = 최신순)
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<
      string,
      { key: string; albumId: string | null; title: string; photographer: string | null; items: AdminPhoto[] }
    >();
    for (const p of photos) {
      if (filter === "hidden" && !p.hidden) continue;
      if (filter === "visible" && p.hidden) continue;
      if (who && p.photographer !== who) continue;
      const key = p.albumId ?? "__single__";
      if (!map.has(key)) {
        order.push(key);
        map.set(key, {
          key,
          albumId: p.albumId,
          title: p.albumId ? p.albumTitle ?? "제목 없는 포트폴리오" : "개별 사진",
          photographer: p.photographer,
          items: [],
        });
      }
      map.get(key)!.items.push(p);
    }
    return order.map((k) => map.get(k)!);
  }, [photos, filter, who]);

  const shownCount = groups.reduce((n, g) => n + g.items.length, 0);

  function markBusy(ids: string[], on: boolean) {
    setBusy((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function apply(ids: Set<string>, hidden: boolean) {
    setPhotos((prev) => prev.map((p) => (ids.has(p.id) ? { ...p, hidden } : p)));
  }

  async function toggleOne(p: AdminPhoto) {
    const next = !p.hidden;
    const ids = new Set([p.id]);
    markBusy([p.id], true);
    apply(ids, next);
    try {
      await setPhotoFeedHidden(p.id, next);
    } catch {
      apply(ids, !next); // 롤백
    } finally {
      markBusy([p.id], false);
    }
  }

  async function toggleAlbum(albumId: string, items: AdminPhoto[], hidden: boolean) {
    const ids = new Set(items.map((i) => i.id));
    const before = new Map(items.map((i) => [i.id, i.hidden]));
    markBusy([...ids], true);
    apply(ids, hidden);
    try {
      await setAlbumFeedHidden(albumId, hidden);
    } catch {
      setPhotos((prev) => prev.map((p) => (before.has(p.id) ? { ...p, hidden: before.get(p.id)! } : p)));
    } finally {
      markBusy([...ids], false);
    }
  }

  const chip = (active: boolean) =>
    `h-7 rounded-full px-3 text-caption font-medium transition-colors ${
      active ? "bg-fg text-bg" : "bg-fg/[0.06] text-fg/70 hover:bg-fg/[0.1]"
    }`;

  return (
    <div className="mt-4">
      {/* 필터 — 스티키 */}
      <div className="sticky top-0 z-10 -mx-4 mb-3 flex flex-wrap items-center gap-2 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur sm:-mx-5 sm:px-5">
        {(["all", "hidden", "visible"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={chip(filter === f)}>
            {f === "all" ? `전체 ${photos.length}` : f === "hidden" ? `숨김 ${hiddenCount}` : "노출 중"}
          </button>
        ))}
        <select
          value={who}
          onChange={(e) => setWho(e.target.value)}
          className="h-7 rounded-full border border-line-strong bg-surface px-2.5 text-caption outline-none focus:border-fg/40"
        >
          <option value="">작가 전체</option>
          {photographers.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className="ml-auto text-caption text-muted">{shownCount}장 표시 중 · 탭하면 숨김/해제</span>
      </div>

      {groups.length === 0 && (
        <p className="rounded-xl border border-line bg-surface p-4 text-body-sm text-muted">
          {filter === "hidden" ? "숨긴 사진이 없어요." : "조건에 맞는 사진이 없어요."}
        </p>
      )}

      <div className="space-y-6">
        {groups.map((g) => {
          const hiddenInGroup = g.items.filter((p) => p.hidden).length;
          const allHidden = hiddenInGroup === g.items.length;
          return (
            <div key={g.key}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 truncate text-body-sm font-semibold text-fg">
                  {g.title}
                  <span className="ml-1.5 text-caption font-normal text-muted">
                    {g.photographer ? `· ${g.photographer} ` : ""}· {g.items.length}장
                    {hiddenInGroup > 0 && <span className="text-warning"> · {hiddenInGroup} 숨김</span>}
                  </span>
                </p>
                {g.albumId && (
                  <button
                    type="button"
                    onClick={() => toggleAlbum(g.albumId!, g.items, !allHidden)}
                    className="shrink-0 rounded-full border border-line-strong px-3 py-1 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04]"
                  >
                    {allHidden ? "포트폴리오 전체 해제" : "포트폴리오 전체 숨김"}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 md:grid-cols-6">
                {g.items.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleOne(p)}
                    aria-pressed={p.hidden}
                    aria-label={p.hidden ? "피드 노출로 되돌리기" : "피드에서 숨기기"}
                    className={`relative aspect-square overflow-hidden rounded-lg transition-opacity ${
                      busy.has(p.id) ? "opacity-40" : ""
                    }`}
                  >
                    <img
                      src={p.thumb_url ?? p.src_url}
                      alt=""
                      loading="lazy"
                      className={`h-full w-full object-cover transition-all ${
                        p.hidden ? "grayscale brightness-50" : ""
                      }`}
                    />
                    {p.hidden && (
                      <span className="absolute inset-x-1 bottom-1 rounded bg-warning px-1 py-0.5 text-center text-[11px] font-semibold text-bg">
                        숨김
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useState } from "react";
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

  // 크게 보기(슬라이드) — 열 때의 목록을 스냅샷으로 잡아둔다.
  // 숨김을 토글하면 필터에 따라 목록에서 빠질 수 있는데, 스냅샷이면 순서·위치가 안 흔들린다.
  const [viewer, setViewer] = useState<{ ids: string[]; idx: number } | null>(null);
  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const current = viewer ? byId.get(viewer.ids[viewer.idx]) ?? null : null;

  const openViewer = (photoId: string) => {
    const ids = groups.flatMap((g) => g.items.map((i) => i.id));
    const idx = ids.indexOf(photoId);
    if (idx >= 0) setViewer({ ids, idx });
  };
  const step = useCallback(
    (delta: number) =>
      setViewer((v) => {
        if (!v) return v;
        const idx = Math.min(Math.max(v.idx + delta, 0), v.ids.length - 1);
        return idx === v.idx ? v : { ...v, idx };
      }),
    []
  );

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

  // 키보드 — 스페이스: 숨김/해제, ←→(↑↓): 이전·다음, Esc: 닫기.
  // 스페이스·방향키는 기본 스크롤을 막아야 사진이 튀지 않는다.
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (!busy.has(current.id)) toggleOne(current);
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        step(-1);
      } else if (e.key === "Escape") {
        setViewer(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // toggleOne 은 매 렌더 새로 만들어지지만 최신 current/busy 를 봐야 하므로 의존성에 둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, busy, step]);

  // 뷰어가 열려 있는 동안 배경 스크롤 잠금 + 앞뒤 사진 미리 로드(방향키 넘김이 즉시 보이게)
  useEffect(() => {
    if (!viewer) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    for (const d of [1, -1]) {
      const p = byId.get(viewer.ids[viewer.idx + d]);
      if (p) {
        const img = new Image();
        img.src = p.src_url;
      }
    }
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [viewer, byId]);

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
                  <div key={p.id} className="relative">
                    <button
                      type="button"
                      onClick={() => toggleOne(p)}
                      aria-pressed={p.hidden}
                      aria-label={p.hidden ? "피드 노출로 되돌리기" : "피드에서 숨기기"}
                      className={`relative block aspect-square w-full overflow-hidden rounded-lg transition-opacity ${
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
                    {/* 크게 보기 — 탭(숨김 토글)과 겹치지 않게 모서리 버튼으로 분리 */}
                    <button
                      type="button"
                      onClick={() => openViewer(p.id)}
                      aria-label="크게 보기"
                      className="absolute right-1 top-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-black/75"
                    >
                      ⤢
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 크게 보기 — 스페이스로 숨김/해제, ←→ 로 이동, Esc 로 닫기 */}
      {viewer && current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="사진 크게 보기"
          className="fixed inset-0 z-50 flex flex-col bg-black/95"
          onClick={() => setViewer(null)}
        >
          {/* 상단 — 위치·작가·닫기 */}
          <div
            className="flex items-center gap-3 px-4 py-3 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-body-sm font-semibold tabular-nums">
              {viewer.idx + 1} / {viewer.ids.length}
            </span>
            <span className="min-w-0 truncate text-caption text-white/70">
              {current.photographer ?? "작가 미상"}
              {current.albumTitle ? ` · ${current.albumTitle}` : ""}
            </span>
            <button
              type="button"
              onClick={() => setViewer(null)}
              className="ml-auto rounded-full bg-white/15 px-3 py-1 text-caption font-medium text-white transition-colors hover:bg-white/25"
            >
              닫기 (Esc)
            </button>
          </div>

          {/* 사진 — 좌우 클릭 영역으로도 이동 */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4">
            <img
              src={current.src_url}
              alt=""
              onClick={(e) => e.stopPropagation()}
              className={`max-h-full max-w-full object-contain transition-all ${
                current.hidden ? "opacity-45 grayscale" : ""
              } ${busy.has(current.id) ? "opacity-40" : ""}`}
            />
            {current.hidden && (
              <span className="pointer-events-none absolute top-3 rounded-full bg-warning px-3 py-1 text-body-sm font-bold text-bg">
                피드에서 숨김
              </span>
            )}
            {viewer.idx > 0 && (
              <button
                type="button"
                aria-label="이전 사진"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-3 py-4 text-lg text-white transition-colors hover:bg-white/25"
              >
                ‹
              </button>
            )}
            {viewer.idx < viewer.ids.length - 1 && (
              <button
                type="button"
                aria-label="다음 사진"
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-3 py-4 text-lg text-white transition-colors hover:bg-white/25"
              >
                ›
              </button>
            )}
          </div>

          {/* 하단 — 숨김 토글 + 키 안내 */}
          <div
            className="flex flex-wrap items-center justify-center gap-3 px-4 py-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => toggleOne(current)}
              disabled={busy.has(current.id)}
              className={`rounded-full px-5 py-2 text-body-sm font-bold transition-opacity disabled:opacity-50 ${
                current.hidden ? "bg-white text-black" : "bg-warning text-bg"
              }`}
            >
              {current.hidden ? "노출로 되돌리기 (Space)" : "피드에서 숨기기 (Space)"}
            </button>
            <span className="text-caption text-white/60">← → 이동 · Space 숨김/해제 · Esc 닫기</span>
          </div>
        </div>
      )}
    </div>
  );
}

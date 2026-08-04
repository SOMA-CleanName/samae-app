"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  togglePhotoExploreCategory,
  setAlbumTargetCategory,
  togglePhotoTargetCategory,
  addAlbumExploreCategory,
  removeAlbumExploreCategory,
} from "./actions";
import type { AssignPhotoWithCats } from "@/lib/explore-db";

type Cat = { id: string; title: string };

// 사진→카테고리 할당 — '타깃 카테고리' 하나를 고르고, 사진을 탭해 담기/빼기.
// 사진은 포트폴리오(앨범)별로 묶여 보이고, 포트폴리오 단위 일괄 담기/빼기도 가능.
export function ExplorePhotoAssigner({
  categories,
  targetCategories = [],
  initialPhotos,
  initialTargetMemberships = {},
}: {
  categories: Cat[];
  targetCategories?: Cat[];
  initialPhotos: AssignPhotoWithCats[];
  initialTargetMemberships?: Record<string, string[]>;
}) {
  // 담기 대상 축 — 탐색 무드 / 타겟(촬영 종류). 같은 사진 그리드에서 축만 바꾼다.
  const router = useRouter();
  const [scope, setScope] = useState<"explore" | "target">("explore");
  const catList = scope === "target" ? targetCategories : categories;
  const [activeCat, setActiveCat] = useState<string>(categories[0]?.id ?? "");
  const [photos, setPhotos] = useState<AssignPhotoWithCats[]>(initialPhotos);
  // 타겟 소속은 별도 맵으로 관리(사진 그리드는 공유)
  const [targetCats, setTargetCats] = useState<Record<string, string[]>>(initialTargetMemberships);
  const catTitle = (id: string) =>
    catList.find((c) => c.id === id)?.title ?? "";

  function switchScope(next: "explore" | "target") {
    setScope(next);
    const first = (next === "target" ? targetCategories : categories)[0]?.id ?? "";
    setActiveCat(first);
  }

  // 현재 축 기준으로 사진이 이 카테고리에 담겨 있는지
  const isOn = (p: AssignPhotoWithCats) =>
    scope === "target"
      ? (targetCats[p.id] ?? []).includes(activeCat)
      : p.categoryIds.includes(activeCat);

  // 포트폴리오(앨범)별 그룹 — 등장 순서 유지. 앨범 없는 사진은 하나의 '개별 사진' 그룹.
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, { key: string; albumId: string | null; title: string; photographer: string | null; items: AssignPhotoWithCats[] }>();
    for (const p of photos) {
      const key = p.album_id ?? "__single__";
      if (!map.has(key)) {
        order.push(key);
        map.set(key, {
          key,
          albumId: p.album_id,
          title: p.album_id ? p.album_title ?? "제목 없는 포트폴리오" : "개별 사진",
          photographer: p.photographer_name,
          items: [],
        });
      }
      map.get(key)!.items.push(p);
    }
    return order.map((k) => map.get(k)!);
  }, [photos]);

  function setPhotoCats(id: string, updater: (cats: string[]) => string[]) {
    setPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, categoryIds: updater(p.categoryIds) } : p))
    );
  }

  async function togglePhoto(p: AssignPhotoWithCats) {
    if (!activeCat) return;
    const on = !isOn(p);

    if (scope === "target") {
      setTargetCats((prev) => {
        const cur = prev[p.id] ?? [];
        return { ...prev, [p.id]: on ? [...cur, activeCat] : cur.filter((c) => c !== activeCat) };
      });
      try {
        await togglePhotoTargetCategory(p.id, activeCat, on);
      } catch {
        setTargetCats((prev) => {
          const cur = prev[p.id] ?? [];
          return { ...prev, [p.id]: on ? cur.filter((c) => c !== activeCat) : [...cur, activeCat] };
        });
      }
      return;
    }

    // 낙관적 업데이트
    setPhotoCats(p.id, (cats) => (on ? [...cats, activeCat] : cats.filter((c) => c !== activeCat)));
    try {
      await togglePhotoExploreCategory(p.id, activeCat, on);
    } catch {
      // 실패 시 롤백
      setPhotoCats(p.id, (cats) => (on ? cats.filter((c) => c !== activeCat) : [...cats, activeCat]));
    }
  }

  async function toggleAlbum(albumId: string, items: AssignPhotoWithCats[], addAll: boolean) {
    if (!activeCat) return;
    const ids = items.map((i) => i.id);

    // 타겟 축 — 앨범당 타겟 1개. 사진 행이 아니라 앨범의 타겟을 바꾼다(작가 선택 덮어쓰기).
    // 담기 = 이 타겟으로 지정(다른 타겟이었으면 이동), 빼기 = 지정 해제.
    if (scope === "target") {
      setTargetCats((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          const cur = next[id] ?? [];
          next[id] = addAll
            ? [...new Set([...cur, activeCat])]
            : cur.filter((c) => c !== activeCat);
        }
        return next;
      });
      try {
        await setAlbumTargetCategory(albumId, addAll ? activeCat : null);
        router.refresh(); // 이전 타겟에서 빠진 것까지 서버 상태로 재동기화
      } catch {
        /* 실패해도 다음 로드 시 서버 상태로 복구됨 */
      }
      return;
    }

    // 낙관적 — 로드된 사진 전체 반영
    setPhotos((prev) =>
      prev.map((p) =>
        ids.includes(p.id)
          ? {
              ...p,
              categoryIds: addAll
                ? [...new Set([...p.categoryIds, activeCat])]
                : p.categoryIds.filter((c) => c !== activeCat),
            }
          : p
      )
    );
    try {
      if (addAll) await addAlbumExploreCategory(albumId, activeCat);
      else await removeAlbumExploreCategory(albumId, activeCat);
    } catch {
      /* 실패해도 다음 로드 시 서버 상태로 복구됨 */
    }
  }

  const src = (p: AssignPhotoWithCats) => p.thumb_url ?? p.src_url;

  if (categories.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-surface p-4 text-body-sm text-muted">
        먼저 <b className="text-fg">카테고리</b>를 만들어 주세요. (탐색 카테고리 관리)
      </p>
    );
  }

  return (
    <div>
      {/* 타깃 카테고리 선택 — 스티키 */}
      <div className="sticky top-0 z-10 -mx-4 mb-3 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur sm:-mx-5 sm:px-5">
        {/* 축 전환 — 탐색 무드 / 타겟(촬영 종류) */}
        {targetCategories.length > 0 && (
          <div className="mb-2 flex gap-1.5">
            {(["explore", "target"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => switchScope(k)}
                className={`h-7 rounded-full px-3 text-caption font-medium transition-colors ${
                  scope === k ? "bg-fg text-bg" : "bg-fg/[0.06] text-fg/70 hover:bg-fg/[0.1]"
                }`}
              >
                {k === "explore" ? "탐색 무드" : "타겟(촬영 종류)"}
              </button>
            ))}
          </div>
        )}
        <label className="flex flex-wrap items-center gap-2 text-body-sm">
          <span className="font-semibold text-fg">담을 카테고리</span>
          <select
            value={activeCat}
            onChange={(e) => setActiveCat(e.target.value)}
            className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-body-sm outline-none focus:border-fg/40"
          >
            {catList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <span className="text-caption text-muted">
            사진을 탭하면 담기/빼기 · 작가가 고른 사진을 빼면 ‘제외’로 기록돼요
          </span>
        </label>
      </div>

      <div className="space-y-6">
        {groups.map((g) => {
          const inCat = g.items.filter((p) => isOn(p)).length;
          const allIn = inCat === g.items.length;
          return (
            <div key={g.key}>
              {/* 포트폴리오 헤더 */}
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-body-sm font-semibold text-fg">
                    {g.title}
                    <span className="ml-1.5 text-caption font-normal text-muted">
                      {g.photographer ? `· ${g.photographer} ` : ""}· {g.items.length}장
                      {inCat > 0 && <span className="text-brand"> · {inCat} 담김</span>}
                    </span>
                  </p>
                </div>
                {g.albumId && (
                  <button
                    type="button"
                    onClick={() => toggleAlbum(g.albumId!, g.items, !allIn)}
                    className="shrink-0 cursor-pointer rounded-full border border-line-strong px-3 py-1 text-caption font-medium text-fg transition-colors hover:bg-fg/[0.05]"
                  >
                    {scope === "target"
                      ? allIn
                        ? "타겟 지정 해제"
                        : "이 타겟으로 지정"
                      : allIn
                        ? "포트폴리오 전체 빼기"
                        : "포트폴리오 전체 담기"}
                  </button>
                )}
              </div>

              {/* 사진 그리드 */}
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">
                {g.items.map((p) => {
                  const on = isOn(p);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePhoto(p)}
                      title={
                        p.categoryIds.length
                          ? "담긴 카테고리: " + p.categoryIds.map(catTitle).join(", ")
                          : "미분류"
                      }
                      className={
                        "group relative aspect-square overflow-hidden rounded-lg bg-surface-2 ring-1 transition-all active:scale-[0.97] " +
                        (on ? "ring-2 ring-brand" : "ring-line")
                      }
                    >
                      <img src={src(p)} alt="" className="h-full w-full object-cover" loading="lazy" />
                      {/* 담김 체크 */}
                      {on && (
                        <span className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-brand text-xs font-bold text-white">
                          ✓
                        </span>
                      )}
                      {/* 다른 카테고리 소속 개수 배지 */}
                      {p.categoryIds.length > 0 && (
                        <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[10px] font-semibold leading-4 text-white">
                          {p.categoryIds.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-center text-caption text-faint">전체 {photos.length}장</p>
    </div>
  );
}

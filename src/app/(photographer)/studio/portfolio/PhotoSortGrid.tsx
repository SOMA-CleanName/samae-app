"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, useTransition } from "react";
import { SortableGrid, SortableItem } from "@/components/ui/SortableGrid";
import { setPhotoVisibility, deletePhoto, reorderAlbumPhotos } from "./actions";

export type SortPhoto = {
  id: string;
  thumb_url: string | null;
  src_url: string;
  visibility: string;
};

// 게시물 사진 그리드 — 드래그로 순서 변경 + 대표 지정(맨 앞=대표) + 공개/삭제.
// 드래그 정렬은 앨범(2장 이상)일 때만. 단일/무앨범은 정렬 없이 그대로.
export function PhotoSortGrid({
  albumId,
  photos,
}: {
  albumId: string | null;
  photos: SortPhoto[];
}) {
  const [order, setOrder] = useState<SortPhoto[]>(photos);
  const [, start] = useTransition();

  // 서버 재검증으로 사진 구성이나 공개 상태가 바뀌면 동기화. 순서만 바뀐 낙관적 갱신은 유지.
  const idSig = [...photos].map((p) => p.id).sort().join(",");
  const lastSig = useRef(idSig);
  useEffect(() => {
    if (idSig !== lastSig.current) {
      setOrder(photos);
      lastSig.current = idSig;
    }
  }, [idSig, photos]);

  const visibilitySig = [...photos]
    .map((p) => `${p.id}:${p.visibility}`)
    .sort()
    .join(",");
  const lastVisibilitySig = useRef(visibilitySig);
  useEffect(() => {
    if (visibilitySig === lastVisibilitySig.current) return;
    const latestById = new Map(photos.map((p) => [p.id, p]));
    setOrder((current) => current.map((p) => latestById.get(p.id) ?? p));
    lastVisibilitySig.current = visibilitySig;
  }, [photos, visibilitySig]);

  const canSort = !!albumId && order.length > 1;

  function persist(next: SortPhoto[]) {
    setOrder(next);
    if (albumId) {
      const ids = next.map((p) => p.id);
      start(() => {
        reorderAlbumPhotos(albumId, ids);
      });
    }
  }

  function onReorder(ids: string[]) {
    const map = new Map(order.map((p) => [p.id, p]));
    persist(ids.map((id) => map.get(id)!).filter(Boolean) as SortPhoto[]);
  }

  function makeCover(id: string) {
    persist([
      ...order.filter((p) => p.id === id),
      ...order.filter((p) => p.id !== id),
    ]);
  }

  const gridCls = "mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4";

  return (
    <SortableGrid ids={order.map((p) => p.id)} onReorder={onReorder} disabled={!canSort} className={gridCls}>
      {(id) => {
        const p = order.find((x) => x.id === id);
        if (!p) return null;
        const isCover = order[0]?.id === id;
        return (
          <SortableItem
            key={id}
            id={id}
            className={`group relative overflow-hidden rounded-lg bg-fg/[0.05] ${
              canSort ? "cursor-grab touch-manipulation select-none active:cursor-grabbing" : ""
            }`}
          >
            {({ isDragging }) => (
              <div className={isDragging ? "shadow-2xl ring-2 ring-fg/30 rounded-lg" : ""}>
                <div className="aspect-square">
                  <img
                    src={p.thumb_url ?? p.src_url}
                    alt=""
                    draggable={false}
                    loading="lazy"
                    className={`pointer-events-none h-full w-full select-none object-cover ${
                      p.visibility === "published" ? "" : "opacity-50"
                    }`}
                  />
                </div>

                <div
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute left-2 top-2 flex flex-col items-start gap-1"
                >
                  {/* 대표 뱃지 (맨 앞 사진) */}
                  {isCover && (
                    <span className="rounded-full bg-fg px-2 py-0.5 text-[10px] font-semibold text-bg shadow">
                      대표
                    </span>
                  )}
                  {canSort && !isCover && (
                    <button
                      type="button"
                      onClick={() => makeCover(p.id)}
                      className="rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-semibold text-fg opacity-0 shadow transition-opacity hover:bg-surface group-hover:opacity-100"
                    >
                      대표로
                    </button>
                  )}
                </div>

                {/* 공개 상태 — 우상단 */}
                {p.visibility === "published" ? (
                  <span
                    className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-white/80"
                    title="공개"
                  />
                ) : (
                  <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                    비공개
                  </span>
                )}

                {/* 하단 액션 — 호버 시. onPointerDown stopPropagation 으로 드래그 시작 방지 */}
                <div
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute inset-x-0 bottom-0 flex flex-wrap gap-1 bg-gradient-to-t from-black/65 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <form action={setPhotoVisibility} className="flex-1">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="visibility" value={p.visibility === "published" ? "draft" : "published"} />
                    <button className="w-full rounded bg-surface/90 py-1 text-[11px] font-medium text-fg hover:bg-surface">
                      {p.visibility === "published" ? "비공개로" : "공개하기"}
                    </button>
                  </form>
                  <form action={deletePhoto}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="rounded bg-brand/90 px-2 py-1 text-[11px] font-medium text-white hover:bg-brand">
                      삭제
                    </button>
                  </form>
                </div>
              </div>
            )}
          </SortableItem>
        );
      }}
    </SortableGrid>
  );
}

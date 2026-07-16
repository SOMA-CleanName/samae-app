"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { useFormStatus } from "react-dom";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { searchExplorePool, setExploreCategoryPhotos } from "./actions";
import type { PoolPhoto } from "@/lib/explore-db";

const POOL_PAGE = 48; // 서버 EXPLORE_POOL_PAGE 와 일치

// 탐색 카테고리에 담을 사진을 전체 published 에서 골라 담고 순서를 배치한다.
// 위: 담긴 존(드래그 재정렬 · ✕ 제거), 아래: 전체 풀(태그 검색 · 탭하면 담김).
// 풀은 details 를 처음 펼칠 때 lazy 로드(카드 20개가 동시에 풀을 당기지 않도록).
export function ExplorePhotoPicker({
  categoryId,
  slug,
  initialPinned,
}: {
  categoryId: string;
  slug: string;
  initialPinned: PoolPhoto[];
}) {
  const [pinned, setPinned] = useState<PoolPhoto[]>(initialPinned);
  const [pool, setPool] = useState<PoolPhoto[]>([]);
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const pinnedIds = new Set(pinned.map((p) => p.id));
  const src = (p: PoolPhoto) => p.thumb_url ?? p.src_url;

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  async function loadPool(reset: boolean) {
    setLoading(true);
    try {
      const off = reset ? 0 : offset;
      const batch = await searchExplorePool(q.trim(), off);
      setPool((prev) => (reset ? batch : [...prev, ...batch]));
      setOffset(off + batch.length);
      setHasMore(batch.length >= POOL_PAGE);
    } finally {
      setLoading(false);
    }
  }

  function onToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    if (e.currentTarget.open && !loaded) {
      setLoaded(true);
      void loadPool(true);
    }
  }

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    void loadPool(true);
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setPinned((p) =>
        arrayMove(
          p,
          p.findIndex((x) => x.id === active.id),
          p.findIndex((x) => x.id === over.id)
        )
      );
    }
  }

  return (
    <details className="mt-3" onToggle={onToggle}>
      <summary className="cursor-pointer text-caption font-medium text-fg">
        🖼 사진 담기·순서
        {pinned.length > 0 && <span className="ml-1 text-brand">· {pinned.length}장 담김</span>}
      </summary>

      <form action={setExploreCategoryPhotos} className="mt-3">
        <input type="hidden" name="id" value={categoryId} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="photoIds" value={pinned.map((p) => p.id).join(",")} />

        <div className="flex items-center justify-between gap-2">
          <p className="text-caption text-muted">
            담김 <b className="text-fg">{pinned.length}</b>장 · 탐색에 이 순서대로 노출돼요
          </p>
          <SaveButton />
        </div>

        {/* 담긴 존 — 드래그 재정렬 · ✕ 제거 */}
        {pinned.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-line-strong px-3 py-4 text-center text-caption text-muted">
            아래 사진을 탭해 담으세요.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={pinned.map((p) => p.id)} strategy={rectSortingStrategy}>
              <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                {pinned.map((p, i) => (
                  <SortableThumb
                    key={p.id}
                    id={p.id}
                    src={src(p)}
                    index={i}
                    onRemove={() => setPinned((prev) => prev.filter((x) => x.id !== p.id))}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </form>

      {/* 전체 풀 — 태그 검색 · 탭하면 담김 */}
      <form onSubmit={onSearch} className="mt-3 flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="태그로 검색 (비우면 최신순)"
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-body-sm outline-none transition-colors focus:border-fg/40"
        />
        <button
          type="submit"
          disabled={loading}
          className="shrink-0 cursor-pointer rounded-lg bg-fg/[0.06] px-3 py-2 text-body-sm font-medium text-fg transition-colors hover:bg-fg/10 disabled:opacity-50"
        >
          검색
        </button>
      </form>

      <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
        {pool.map((p) => {
          const already = pinnedIds.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              disabled={already}
              onClick={() => setPinned((prev) => [...prev, p])}
              className="group relative aspect-square overflow-hidden rounded-lg bg-surface-2 ring-1 ring-line active:scale-[0.97] disabled:cursor-default"
            >
              <img src={src(p)} alt="" className="h-full w-full object-cover" loading="lazy" />
              {already ? (
                <span className="absolute inset-0 grid place-items-center bg-black/50 text-lg font-bold text-white/90">
                  ✓
                </span>
              ) : (
                <span className="absolute inset-0 grid place-items-center bg-black/0 text-lg font-bold text-white/0 transition-colors group-active:bg-black/40 group-active:text-white/90">
                  +
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loaded && pool.length === 0 && !loading && (
        <p className="mt-2 text-caption text-muted">검색 결과가 없어요.</p>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={() => void loadPool(false)}
          disabled={loading}
          className="mt-2 w-full cursor-pointer rounded-lg border border-line-strong px-3 py-2 text-body-sm font-medium text-muted transition-colors hover:bg-fg/[0.04] disabled:opacity-50"
        >
          {loading ? "불러오는 중…" : "더 보기"}
        </button>
      )}
    </details>
  );
}

function SortableThumb({
  id,
  src,
  index,
  onRemove,
}: {
  id: string;
  src: string;
  index: number;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative aspect-square overflow-hidden rounded-lg bg-surface-2 ring-2 ring-brand"
    >
      {/* 이미지 영역이 드래그 핸들 — touch-none 으로 스크롤 대신 드래그 */}
      <img
        {...listeners}
        {...attributes}
        src={src}
        alt=""
        className="h-full w-full touch-none object-cover"
        loading="lazy"
        draggable={false}
      />
      <span className="pointer-events-none absolute left-0.5 top-0.5 rounded bg-brand px-1 text-[10px] font-bold leading-4 text-white">
        {index + 1}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-xs text-white active:bg-black/80"
        aria-label="제거"
      >
        ✕
      </button>
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 cursor-pointer rounded-lg bg-fg px-3 py-1.5 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "저장 중…" : "사진 저장"}
    </button>
  );
}

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
import { setCategoryPhotoOrder } from "./actions";
import type { AdCandidatePhoto } from "@/lib/categories";

// 카테고리 '첫 진입 시 보여줄 사진'의 고정 순서 배치 (모바일 기준).
// 위: 고정 순서 존(드래그로 재정렬 · ✕로 제거), 아래: 전체 풀(탭하면 고정 순서 맨 뒤에 추가).
export function CategoryPhotoOrder({
  categoryId,
  slug,
  candidates,
  ordered,
}: {
  categoryId: string;
  slug: string;
  candidates: AdCandidatePhoto[];
  ordered: string[];
}) {
  const byId = new Map(candidates.map((p) => [p.id, p]));
  // 저장된 순서 중 아직 카테고리에 남아있는 사진만
  const [pinned, setPinned] = useState<string[]>(ordered.filter((id) => byId.has(id)));
  const pinnedSet = new Set(pinned);
  const pool = candidates.filter((p) => !pinnedSet.has(p.id));

  const sensors = useSensors(
    // 터치: 살짝 누르고 있어야 드래그 시작 → 스크롤·탭과 충돌 방지
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setPinned((p) => arrayMove(p, p.indexOf(String(active.id)), p.indexOf(String(over.id))));
    }
  }

  const src = (p: AdCandidatePhoto) => p.thumb_url ?? p.src_url;

  return (
    <form action={setCategoryPhotoOrder} className="mt-3">
      <input type="hidden" name="id" value={categoryId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="orderedIds" value={pinned.join(",")} />

      <div className="flex items-center justify-between gap-2">
        <p className="text-caption text-muted">
          첫 진입 시 상단 노출 순서 · 고정 <b className="text-fg">{pinned.length}</b>장 / 전체{" "}
          {candidates.length}장
        </p>
        <SaveButton />
      </div>

      {/* 고정 순서 존 — 드래그로 재정렬 */}
      <p className="mt-2 text-caption font-medium text-fg">고정 순서 (드래그로 배치 · ✕ 제거)</p>
      {pinned.length === 0 ? (
        <p className="mt-1 rounded-lg border border-dashed border-line-strong px-3 py-4 text-center text-caption text-muted">
          아래 사진을 탭해 고정 순서에 추가하세요.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={pinned} strategy={rectSortingStrategy}>
            <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {pinned.map((id, i) => {
                const p = byId.get(id);
                if (!p) return null;
                return (
                  <SortableThumb
                    key={id}
                    id={id}
                    src={src(p)}
                    index={i}
                    onRemove={() => setPinned((prev) => prev.filter((x) => x !== id))}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* 전체 풀 — 탭하면 고정 순서 맨 뒤에 추가 */}
      <p className="mt-3 text-caption font-medium text-fg">전체 풀 (탭해서 추가)</p>
      <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
        {pool.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPinned((prev) => [...prev, p.id])}
            className="group relative aspect-square overflow-hidden rounded-lg bg-surface-2 ring-1 ring-line active:scale-[0.97]"
          >
            <img src={src(p)} alt="" className="h-full w-full object-cover" loading="lazy" />
            <span className="absolute inset-0 grid place-items-center bg-black/0 text-lg font-bold text-white/0 transition-colors group-active:bg-black/40 group-active:text-white/90">
              +
            </span>
          </button>
        ))}
        {pool.length === 0 && (
          <p className="col-span-full text-caption text-muted">모든 사진이 고정 순서에 있어요.</p>
        )}
      </div>
    </form>
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
      {pending ? "저장 중…" : "순서 저장"}
    </button>
  );
}

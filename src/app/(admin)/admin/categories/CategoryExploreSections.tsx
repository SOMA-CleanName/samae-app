"use client";

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
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { setCategoryExploreSections } from "./actions";

export type ExploreOption = { id: string; title: string; published: boolean };

// 광고 진입 시 탐색 탭에 보여줄 탐색 카테고리 + 순서.
// 위: 선택된 카테고리(드래그로 순서 · ✕ 제거), 아래: 후보(탭해서 추가).
export function CategoryExploreSections({
  categoryId,
  slug,
  options,
  selected,
}: {
  categoryId: string;
  slug: string;
  options: ExploreOption[];
  selected: string[];
}) {
  const byId = new Map(options.map((o) => [o.id, o]));
  const [picked, setPicked] = useState<string[]>(selected.filter((id) => byId.has(id)));
  const pickedSet = new Set(picked);
  const pool = options.filter((o) => !pickedSet.has(o.id));

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setPicked((p) => arrayMove(p, p.indexOf(String(active.id)), p.indexOf(String(over.id))));
    }
  }

  return (
    <form action={setCategoryExploreSections} className="mt-3">
      <input type="hidden" name="id" value={categoryId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="exploreIds" value={picked.join(",")} />

      <div className="flex items-center justify-between gap-2">
        <p className="text-caption text-muted">
          이 광고 진입 시 탐색 탭에 <b className="text-fg">{picked.length}</b>개 노출
          {picked.length === 0 && " (비우면 기본: 전체 공개 순서)"}
        </p>
        <SaveButton />
      </div>

      {/* 선택된 순서 — 드래그로 배치 */}
      {picked.length > 0 && (
        <DndContext id={`sections-${categoryId}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={picked} strategy={horizontalListSortingStrategy}>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {picked.map((id, i) => {
                const o = byId.get(id);
                if (!o) return null;
                return (
                  <SortableChip
                    key={id}
                    id={id}
                    index={i}
                    label={o.title}
                    dim={!o.published}
                    onRemove={() => setPicked((prev) => prev.filter((x) => x !== id))}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* 후보 — 탭해서 추가 */}
      <p className="mt-3 text-caption font-medium text-fg">추가 (탭)</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {pool.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setPicked((prev) => [...prev, o.id])}
            className={
              "cursor-pointer rounded-full border border-line-strong px-2.5 py-1 text-caption font-medium transition-colors hover:bg-fg/[0.05] " +
              (o.published ? "text-fg" : "text-faint")
            }
          >
            + {o.title}
            {!o.published && " (비공개)"}
          </button>
        ))}
        {pool.length === 0 && (
          <p className="text-caption text-muted">모든 탐색 카테고리가 선택됐어요.</p>
        )}
      </div>
    </form>
  );
}

function SortableChip({
  id,
  index,
  label,
  dim,
  onRemove,
}: {
  id: string;
  index: number;
  label: string;
  dim: boolean;
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
    <span
      ref={setNodeRef}
      style={style}
      className={
        "inline-flex items-center gap-1 rounded-full border-2 border-brand px-2.5 py-1 text-caption font-medium " +
        (dim ? "text-faint" : "text-fg")
      }
    >
      <span className="text-[10px] font-bold text-brand">{index + 1}</span>
      {/* 라벨 영역이 드래그 핸들 */}
      <span {...listeners} {...attributes} className="cursor-grab touch-none select-none">
        {label}
        {dim && " (비공개)"}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 text-muted hover:text-danger"
        aria-label="제거"
      >
        ✕
      </button>
    </span>
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

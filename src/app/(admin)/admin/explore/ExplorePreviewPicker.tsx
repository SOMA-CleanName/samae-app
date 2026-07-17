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
import {
  loadExploreCategoryMembers,
  setExplorePreviewPhotos,
  type PreviewCandidate,
} from "./actions";

// 홈 스트립 미리보기 사진 — 카테고리 담긴 사진 중에서 골라 순서 배치.
// 비우면 담긴 순서(position) 앞 N장이 기본. 펼칠 때 멤버를 lazy 로드.
export function ExplorePreviewPicker({
  categoryId,
  slug,
  previewPhotoIds,
}: {
  categoryId: string;
  slug: string;
  previewPhotoIds: string[];
}) {
  const [members, setMembers] = useState<PreviewCandidate[]>([]);
  const [picked, setPicked] = useState<string[]>(previewPhotoIds);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const byId = new Map(members.map((m) => [m.id, m]));
  const pickedSet = new Set(picked);
  const pool = members.filter((m) => !pickedSet.has(m.id));
  const src = (p: PreviewCandidate) => p.thumb_url ?? p.src_url;

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

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

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setPicked((p) => arrayMove(p, p.indexOf(String(active.id)), p.indexOf(String(over.id))));
    }
  }

  return (
    <details className="mt-3" onToggle={onToggle}>
      <summary className="cursor-pointer text-caption font-medium text-fg">
        🖼 미리보기 사진 (홈 스트립)
        {picked.length > 0 && <span className="ml-1 text-brand">· {picked.length}장 지정</span>}
      </summary>

      <form action={setExplorePreviewPhotos} className="mt-3">
        <input type="hidden" name="id" value={categoryId} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="photoIds" value={picked.join(",")} />

        <div className="flex items-center justify-between gap-2">
          <p className="text-caption text-muted">
            지정 <b className="text-fg">{picked.length}</b>장을 스트립 앞에 고정 · 나머지는 담긴 순서로 채움
            {picked.length === 0 && " (비우면 담긴 순서 앞부터)"}
          </p>
          <SaveButton />
        </div>

        {/* 지정된 미리보기 — 드래그로 순서 · ✕ 제거 */}
        {picked.length > 0 && (
          <DndContext
            id={`preview-${categoryId}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={picked} strategy={rectSortingStrategy}>
              <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                {picked.map((id, i) => {
                  const p = byId.get(id);
                  return (
                    <SortableThumb
                      key={id}
                      id={id}
                      index={i}
                      src={p ? src(p) : ""}
                      onRemove={() => setPicked((prev) => prev.filter((x) => x !== id))}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* 담긴 사진 풀 — 탭해서 미리보기에 추가 */}
        <p className="mt-3 text-caption font-medium text-fg">담긴 사진 (탭해서 추가)</p>
        {loading ? (
          <p className="mt-1.5 text-caption text-muted">불러오는 중…</p>
        ) : members.length === 0 ? (
          <p className="mt-1.5 text-caption text-muted">
            담긴 사진이 없어요. 먼저 사진에 카테고리를 지정하세요.
          </p>
        ) : (
          <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {pool.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPicked((prev) => [...prev, p.id])}
                className="group relative aspect-square overflow-hidden rounded-lg bg-surface-2 ring-1 ring-line active:scale-[0.97]"
              >
                <img src={src(p)} alt="" className="h-full w-full object-cover" loading="lazy" />
                <span className="absolute inset-0 grid place-items-center bg-black/0 text-lg font-bold text-white/0 transition-colors group-active:bg-black/40 group-active:text-white/90">
                  +
                </span>
              </button>
            ))}
            {pool.length === 0 && (
              <p className="col-span-full text-caption text-muted">모든 사진이 미리보기에 있어요.</p>
            )}
          </div>
        )}
      </form>
    </details>
  );
}

function SortableThumb({
  id,
  index,
  src,
  onRemove,
}: {
  id: string;
  index: number;
  src: string;
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
      {src ? (
        <img
          {...listeners}
          {...attributes}
          src={src}
          alt=""
          className="h-full w-full touch-none object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        // 멤버 로드 전이거나 멤버에서 빠진 사진 — 자리만 유지
        <div {...listeners} {...attributes} className="h-full w-full touch-none bg-fg/[0.06]" />
      )}
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
      {pending ? "저장 중…" : "미리보기 저장"}
    </button>
  );
}

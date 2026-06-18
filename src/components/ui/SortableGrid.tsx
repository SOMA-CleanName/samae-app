"use client";

import type { ReactNode } from "react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// 재사용 드래그 정렬 그리드 — dnd-kit 기반.
//   · 데스크톱(마우스): 6px 이동하면 드래그 시작(바로 끌림)
//   · 모바일(터치): 180ms 길게 누르면 드래그(평소 스크롤은 그대로 동작 → 스크롤 막힘 없음)
//   · 드래그 중 주변 항목이 FLIP 애니메이션으로 부드럽게 밀려남
// 사용: <SortableGrid ids={ids} onReorder={setIds}>{(id) => <SortableItem id={id}>…</SortableItem>}</SortableGrid>
export function SortableGrid({
  ids,
  onReorder,
  className,
  disabled,
  children,
}: {
  ids: string[];
  onReorder: (ids: string[]) => void;
  className?: string;
  disabled?: boolean;
  children: (id: string) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  }

  if (disabled) {
    return <div className={className}>{ids.map((id) => children(id))}</div>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={className}>{ids.map((id) => children(id))}</div>
      </SortableContext>
    </DndContext>
  );
}

// 그리드 내 항목 래퍼 — 드래그 핸들(=래퍼 전체)을 자동 연결. children 은 드래그 상태를 받는다.
//   interactive 자식(버튼 등)은 onPointerDown 으로 stopPropagation 하면 드래그가 시작되지 않는다.
export function SortableItem({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: (state: { isDragging: boolean }) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className={className} {...attributes} {...listeners}>
      {children({ isDragging })}
    </div>
  );
}

"use client";

import { useMemo } from "react";

// 포트폴리오(피드) 1개당 카테고리 선택 — 타겟 1개 + 그 타겟에 속한 탐색(무드) 여러 개.
// 타겟을 고르면 그 타겟에 연결된 무드만 나온다. 타겟을 바꾸면 새 타겟에 없는 선택은 자동으로 빠진다.
// 사진 단위가 아니라 피드 단위 — 이 선택이 탐색탭 노출의 기본 소스가 된다.

export type TargetOption = {
  id: string;
  name: string;
  explores: Array<{ id: string; title: string }>;
};

export function CategoryPicker({
  targets,
  targetId,
  exploreIds,
  onChange,
  disabled,
}: {
  targets: TargetOption[];
  targetId: string | null;
  exploreIds: string[];
  onChange: (next: { targetId: string | null; exploreIds: string[] }) => void;
  disabled?: boolean;
}) {
  const current = useMemo(() => targets.find((t) => t.id === targetId) ?? null, [targets, targetId]);

  function pickTarget(id: string) {
    if (id === targetId) return;
    // 타겟 변경 — 새 타겟에도 있는 무드만 유지(N:M 이라 겹칠 수 있음)
    const next = targets.find((t) => t.id === id);
    const keep = new Set((next?.explores ?? []).map((e) => e.id));
    onChange({ targetId: id, exploreIds: exploreIds.filter((e) => keep.has(e)) });
  }
  function toggleExplore(id: string) {
    const has = exploreIds.includes(id);
    onChange({
      targetId,
      exploreIds: has ? exploreIds.filter((e) => e !== id) : [...exploreIds, id],
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-1.5 text-xs font-medium text-fg/70">
          촬영 종류 <span className="text-brand">*</span>
          <span className="ml-1 font-normal text-fg/45">1개만 선택</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {targets.map((t) => {
            const on = t.id === targetId;
            return (
              <button
                key={t.id}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => pickTarget(t.id)}
                className={`h-9 cursor-pointer rounded-full px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  on ? "bg-fg text-bg" : "bg-fg/[0.06] text-fg/75 hover:bg-fg/[0.1]"
                }`}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      </div>

      {current && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-fg/70">
            무드 <span className="text-brand">*</span>
            <span className="ml-1 font-normal text-fg/45">
              여러 개 선택 · 탐색탭에서 이 무드로 노출돼요
            </span>
          </p>
          {current.explores.length === 0 ? (
            <p className="rounded-xl bg-fg/[0.04] px-3 py-2.5 text-xs text-fg/55">
              이 종류에 연결된 무드가 아직 없어요. 운영자에게 문의해주세요.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {current.explores.map((e) => {
                const on = exploreIds.includes(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={on}
                    onClick={() => toggleExplore(e.id)}
                    className={`h-8 cursor-pointer rounded-full px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      on
                        ? "bg-brand text-white"
                        : "bg-transparent text-fg/70 ring-1 ring-fg/15 hover:bg-fg/[0.05]"
                    }`}
                  >
                    {e.title}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 선택 유효성 — 저장 버튼 활성/검증 문구를 한 곳에서 판단. */
export function categorySelectionError(
  targetId: string | null,
  exploreIds: string[]
): string | null {
  if (!targetId) return "촬영 종류를 선택해주세요.";
  if (exploreIds.length === 0) return "무드를 1개 이상 선택해주세요.";
  return null;
}

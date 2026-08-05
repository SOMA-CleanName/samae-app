"use client";

import { useMemo, useRef, useState } from "react";

// 포트폴리오(피드) 1개당 카테고리 선택.
//  · 촬영 종류(타겟) 1개 — 필수
//  · 무드(탐색 카테고리) 여러 개 — 선택. 목록에 없으면 '+ 직접 입력'으로 요청만 남긴다
//    (카테고리가 새로 만들어지지는 않고, 운영자가 어느 포폴에 무엇을 원하는지 본다)
//  · 사매 광고 소재 사용 동의 — 선택
// 사진 단위가 아니라 피드 단위 — 이 선택이 탐색탭 노출의 기본 소스가 된다.

export const MAX_REQUESTED = 5;

export type TargetOption = {
  id: string;
  name: string;
  explores: Array<{ id: string; title: string }>;
};

export type CategorySelection = {
  targetId: string | null;
  exploreIds: string[];
  requestedMoods: string[];
  adConsent: boolean;
};

export function CategoryPicker({
  targets,
  value,
  onChange,
  disabled,
}: {
  targets: TargetOption[];
  value: CategorySelection;
  onChange: (next: CategorySelection) => void;
  disabled?: boolean;
}) {
  const { targetId, exploreIds, requestedMoods, adConsent } = value;
  const current = useMemo(() => targets.find((t) => t.id === targetId) ?? null, [targets, targetId]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function pickTarget(id: string) {
    if (id === targetId) return;
    // 타겟 변경 — 새 타겟에도 있는 무드만 유지(N:M 이라 겹칠 수 있음)
    const next = targets.find((t) => t.id === id);
    const keep = new Set((next?.explores ?? []).map((e) => e.id));
    onChange({ ...value, targetId: id, exploreIds: exploreIds.filter((e) => keep.has(e)) });
  }
  function toggleExplore(id: string) {
    const has = exploreIds.includes(id);
    onChange({
      ...value,
      exploreIds: has ? exploreIds.filter((e) => e !== id) : [...exploreIds, id],
    });
  }
  function addRequested() {
    const label = draft.trim().slice(0, 20);
    if (!label || requestedMoods.includes(label) || requestedMoods.length >= MAX_REQUESTED) {
      setDraft("");
      return;
    }
    onChange({ ...value, requestedMoods: [...requestedMoods, label] });
    setDraft("");
    inputRef.current?.focus();
  }
  function removeRequested(label: string) {
    onChange({ ...value, requestedMoods: requestedMoods.filter((m) => m !== label) });
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-1.5 text-xs font-medium text-fg/70">
          촬영 종류 <span className="text-brand">*</span>
          <span className="ml-1 font-normal text-fg/45">1개만 선택 · 필수</span>
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
            무드 <span className="font-normal text-fg/45">(선택)</span>
            <span className="ml-1 font-normal text-fg/45">
              여러 개 선택 · 탐색탭에서 이 무드로 노출돼요
            </span>
          </p>
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

            {/* 직접 입력한 요청 무드 — 카테고리가 되진 않고 운영자에게 전달만 */}
            {requestedMoods.map((m) => (
              <span
                key={m}
                className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-brand/50 bg-brand/[0.06] px-3 text-[13px] font-medium text-brand"
              >
                {m}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removeRequested(m)}
                  aria-label={`${m} 요청 취소`}
                  className="cursor-pointer text-brand/60 hover:text-brand"
                >
                  ✕
                </button>
              </span>
            ))}

            {adding ? (
              <span className="inline-flex h-8 items-center gap-1 rounded-full border border-fg/20 px-2">
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(ev) => setDraft(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") {
                      ev.preventDefault();
                      addRequested();
                    } else if (ev.key === "Escape") {
                      setAdding(false);
                      setDraft("");
                    }
                  }}
                  onBlur={() => {
                    addRequested();
                    setAdding(false);
                  }}
                  autoFocus
                  maxLength={20}
                  placeholder="원하는 무드"
                  className="w-24 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg/40"
                />
              </span>
            ) : (
              requestedMoods.length < MAX_REQUESTED && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setAdding(true)}
                  className="h-8 cursor-pointer rounded-full border border-dashed border-fg/25 px-3 text-[13px] font-medium text-fg/55 transition-colors hover:border-fg/40 hover:text-fg/75 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + 직접 입력
                </button>
              )
            )}
          </div>
          {requestedMoods.length > 0 && (
            <p className="mt-1.5 text-[11px] leading-tight text-fg/45">
              직접 입력한 무드는 바로 노출되지 않고, 운영자가 확인한 뒤 반영돼요.
            </p>
          )}
          {current.explores.length === 0 && requestedMoods.length === 0 && (
            <p className="mt-1.5 text-[11px] text-fg/45">
              이 종류에 연결된 무드가 아직 없어요. 원하는 무드를 직접 적어주시면 운영자가 확인해요.
            </p>
          )}
        </div>
      )}

      {/* 사매 광고 소재 사용 동의 */}
      <label className="flex cursor-pointer items-start gap-2 text-xs text-fg/70">
        <input
          type="checkbox"
          checked={adConsent}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, adConsent: e.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand"
        />
        <span>
          이 포트폴리오 사진을 <b className="font-semibold text-fg">사매 광고 소재</b>로 사용하는 데
          동의합니다.
          <span className="ml-1 text-fg/45">(선택 · 언제든 편집에서 해제할 수 있어요)</span>
        </span>
      </label>
    </div>
  );
}

/** 선택 유효성 — 필수는 촬영 종류뿐(무드는 선택). */
export function categorySelectionError(targetId: string | null): string | null {
  if (!targetId) return "촬영 종류를 선택해주세요.";
  return null;
}

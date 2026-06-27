"use client";

import { useState } from "react";
import { updatePackage, deletePackage, togglePackageActive } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";

export type Pkg = {
  id: string;
  name: string;
  description: string;
  price_krw: number;
  duration_min: number;
  edited_count: number;
  is_active: boolean;
};

const inputCls =
  "rounded-lg border border-fg/15 bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-fg/40";
const fmt = new Intl.NumberFormat("ko-KR");

// 패키지 1행 — 평소엔 보기 모드, '수정'을 눌러야 편집. 삭제는 확인 후 진행.
export function PackageItem({ p }: { p: Pkg }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="rounded-xl border border-fg/10 p-4">
        <form action={updatePackage} className="grid gap-3" onSubmit={() => setEditing(false)}>
          <input type="hidden" name="id" value={p.id} />
          <input name="name" defaultValue={p.name} required className={inputCls} />
          <textarea name="description" rows={2} defaultValue={p.description} className={inputCls} />
          <div className="grid grid-cols-3 gap-2">
            <LabeledInput name="priceKrw" label="가격(원)" defaultValue={String(p.price_krw)} min={0} max={100_000_000} step={10_000} required />
            <LabeledInput name="durationMin" label="소요(분)" defaultValue={String(p.duration_min)} min={10} max={1440} step={5} required />
            <LabeledInput name="editedCount" label="보정본(장)" defaultValue={String(p.edited_count)} min={0} max={1000} step={1} required />
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-full bg-fg px-4 py-1.5 text-xs font-semibold text-bg hover:opacity-90">
              저장
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-full border border-fg/20 px-4 py-1.5 text-xs text-fg/70 hover:bg-fg/[0.04]"
            >
              취소
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-fg/10 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            <span className="truncate">{p.name}</span>
            <StatusPill active={p.is_active} />
          </p>
          {p.description && <p className="mt-0.5 text-sm text-fg/55">{p.description}</p>}
          <p className="mt-1 text-sm text-fg/70">
            ₩{fmt.format(p.price_krw)} · {p.duration_min}분 · 보정 {p.edited_count}장
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-fg/8 pt-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-full bg-fg px-4 py-1.5 text-xs font-semibold text-bg hover:opacity-90"
        >
          수정
        </button>
        <form action={togglePackageActive}>
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="isActive" value={String(!p.is_active)} />
          <SubmitButton pendingText="처리 중…" className="rounded-full border border-fg/20 px-3 py-1.5 text-xs text-fg/70 hover:bg-fg/[0.04] disabled:opacity-50">
            {p.is_active ? "비활성화" : "활성화"}
          </SubmitButton>
        </form>
        <form
          action={deletePackage}
          onSubmit={(e) => {
            if (!confirm(`'${p.name}' 패키지를 삭제할까요? 되돌릴 수 없어요.`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={p.id} />
          <SubmitButton pendingText="삭제 중…" className="rounded-full px-3 py-1.5 text-xs text-brand hover:bg-brand/[0.06] disabled:opacity-50">
            삭제
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}

function LabeledInput({
  name,
  label,
  defaultValue,
  min,
  max,
  step,
  required,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-fg/55">
      {label}
      <input
        name={name}
        type="number"
        defaultValue={defaultValue}
        required={required}
        min={min}
        max={max}
        step={step}
        className="rounded-lg border border-fg/15 bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-fg/40"
      />
    </label>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
        active ? "bg-success-soft text-success" : "bg-fg/10 text-fg/50"
      }`}
    >
      {active ? "노출 중" : "비활성"}
    </span>
  );
}

"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileState } from "../actions";
import type { ProfileInitial } from "./page";

const initialState: ProfileState = {};

// 작가 프로필 편집 폼
export function ProfileForm({ initial }: { initial: ProfileInitial }) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Field name="displayName" label="작가명" defaultValue={initial.displayName} error={state.fieldErrors?.displayName} />

      <div className="flex flex-col gap-1">
        <label htmlFor="bio" className="text-sm font-medium">소개</label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={500}
          defaultValue={initial.bio}
          className="rounded-xl border border-fg/15 bg-white px-4 py-3 text-sm outline-none focus:border-fg/40"
        />
      </div>

      <Field name="regions" label="활동 지역" defaultValue={initial.regions} hint="쉼표로 구분 (예: 성수, 한강)" />
      <Field name="moodTags" label="무드 태그" defaultValue={initial.moodTags} hint="쉼표로 구분 (예: 필름, 내추럴)" />
      <Field name="priceFrom" label="최저가 (원)" type="number" defaultValue={String(initial.priceFrom)} hint="표시용 시작 가격" />

      {/* 촬영비 수취 계좌 — 예약 확정 시 해당 고객에게 노출됨 */}
      <fieldset className="mt-2 rounded-xl border border-fg/10 p-4">
        <legend className="px-1 text-xs text-fg/55">촬영비 수취 계좌</legend>
        <p className="mb-2 text-xs text-fg/45">
          예약이 확정되면 고객이 이 계좌로 촬영비를 직접 송금합니다.
        </p>
        <div className="flex flex-col gap-3">
          <Field name="bankName" label="은행" defaultValue={initial.bankName} />
          <Field name="accountNumber" label="계좌번호" defaultValue={initial.accountNumber} />
          <Field name="accountHolder" label="예금주" defaultValue={initial.accountHolder} />
        </div>
      </fieldset>

      {state.error && <p className="text-sm text-brand">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">저장됐어요.</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 w-full rounded-xl bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "저장 중…" : "저장"}
      </button>
    </form>
  );
}

function Field({
  name,
  label,
  defaultValue,
  hint,
  error,
  type = "text",
}: {
  name: string;
  label: string;
  defaultValue?: string;
  hint?: string;
  error?: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        className="rounded-xl border border-fg/15 bg-white px-4 py-3 text-sm outline-none focus:border-fg/40"
      />
      {hint && !error && <p className="text-xs text-fg/45">{hint}</p>}
      {error && <p className="text-xs text-brand">{error}</p>}
    </div>
  );
}

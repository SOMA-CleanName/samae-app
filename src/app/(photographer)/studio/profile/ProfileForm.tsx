"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileState } from "../actions";
import type { ProfileInitial } from "./page";

const initialState: ProfileState = {};

// 송금 받을 은행 목록 (토글 선택)
const BANKS = [
  "국민은행", "신한은행", "우리은행", "하나은행", "농협은행", "기업은행",
  "카카오뱅크", "토스뱅크", "케이뱅크", "SC제일은행", "씨티은행", "수협은행",
  "부산은행", "대구은행", "경남은행", "광주은행", "전북은행", "제주은행",
  "새마을금고", "신협", "우체국", "산업은행",
];

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
      <Field name="moodTags" label="태그" defaultValue={initial.moodTags} hint="쉼표로 구분 (예: 필름, 내추럴)" />
      <Field
        name="priceFrom"
        label="최저가 (원)"
        type="number"
        defaultValue={String(initial.priceFrom)}
        hint="표시용 시작 가격 (최대 350만원)"
        min={0}
        max={3_500_000}
        step={1_000}
        error={state.fieldErrors?.priceFrom}
      />

      {/* 촬영비 수취 계좌 — 예약 확정 시 해당 고객에게 노출됨 */}
      <fieldset className="mt-2 rounded-xl border border-fg/10 p-4">
        <legend className="px-1 text-xs text-fg/55">촬영비 수취 계좌</legend>
        <p className="mb-2 text-xs text-fg/45">
          예약이 확정되면 고객이 이 계좌로 촬영비를 직접 송금합니다.
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="bankName" className="text-sm font-medium">은행</label>
            <select
              id="bankName"
              name="bankName"
              defaultValue={initial.bankName}
              className="rounded-xl border border-fg/15 bg-white px-4 py-3 text-sm outline-none focus:border-fg/40"
            >
              <option value="">선택 안 함</option>
              {/* 기존에 목록 밖 값이 저장돼 있으면 유지 */}
              {initial.bankName && !BANKS.includes(initial.bankName) && (
                <option value={initial.bankName}>{initial.bankName}</option>
              )}
              {BANKS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
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
  min,
  max,
  step,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  hint?: string;
  error?: string;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        min={min}
        max={max}
        step={step}
        className="rounded-xl border border-fg/15 bg-white px-4 py-3 text-sm outline-none focus:border-fg/40"
      />
      {hint && !error && <p className="text-xs text-fg/45">{hint}</p>}
      {error && <p className="text-xs text-brand">{error}</p>}
    </div>
  );
}

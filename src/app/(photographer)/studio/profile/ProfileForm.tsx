"use client";

import { useActionState, useState } from "react";
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

// 작가 프로필 편집 폼 — controlled 입력. 저장(서버액션)은 새로고침 없이 처리하고
// 입력한 값을 그대로 유지한다(저장 후 폼이 옛 값으로 되돌아가는 문제 방지).
export function ProfileForm({ initial }: { initial: ProfileInitial }) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);
  const [f, setF] = useState({
    displayName: initial.displayName,
    bio: initial.bio,
    regions: initial.regions,
    moodTags: initial.moodTags,
    priceFrom: String(initial.priceFrom),
    bankName: initial.bankName,
    accountNumber: initial.accountNumber,
    accountHolder: initial.accountHolder,
  });
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setF((prev) => ({ ...prev, [k]: e.target.value }));

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Field name="displayName" label="작가명" value={f.displayName} onChange={set("displayName")} error={state.fieldErrors?.displayName} />

      <div className="flex flex-col gap-1">
        <label htmlFor="bio" className="text-sm font-medium">소개</label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={500}
          value={f.bio}
          onChange={set("bio")}
          className="rounded-xl border border-fg/15 bg-white px-4 py-3 text-sm outline-none focus:border-fg/40"
        />
      </div>

      <Field name="regions" label="활동 지역" value={f.regions} onChange={set("regions")} hint="쉼표로 구분 (예: 성수, 한강)" />
      <Field name="moodTags" label="태그" value={f.moodTags} onChange={set("moodTags")} hint="쉼표로 구분 (예: 필름, 내추럴)" />
      <Field
        name="priceFrom"
        label="최저가 (원)"
        type="number"
        value={f.priceFrom}
        onChange={set("priceFrom")}
        hint="표시용 시작 가격"
        min={0}
        max={100_000_000}
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
            <div className="relative">
              <select
                id="bankName"
                name="bankName"
                value={f.bankName}
                onChange={set("bankName")}
                className="w-full appearance-none rounded-xl border border-fg/15 bg-white px-4 py-3 pr-12 text-sm outline-none focus:border-fg/40"
              >
                <option value="">선택 안 함</option>
                {/* 기존에 목록 밖 값이 저장돼 있으면 유지 */}
                {f.bankName && !BANKS.includes(f.bankName) && (
                  <option value={f.bankName}>{f.bankName}</option>
                )}
                {BANKS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-xs text-fg/45">
                ▼
              </span>
            </div>
            {state.fieldErrors?.bankName && (
              <p className="text-xs text-brand">{state.fieldErrors.bankName}</p>
            )}
          </div>
          <Field name="accountNumber" label="계좌번호" value={f.accountNumber} onChange={set("accountNumber")} error={state.fieldErrors?.accountNumber} />
          <Field name="accountHolder" label="예금주" value={f.accountHolder} onChange={set("accountHolder")} error={state.fieldErrors?.accountHolder} />
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
  value,
  onChange,
  hint,
  error,
  type = "text",
  min,
  max,
  step,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
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
        value={value}
        onChange={onChange}
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

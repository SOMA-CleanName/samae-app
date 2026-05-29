"use client";

import { useActionState } from "react";
import { applyAsPhotographer, type ApplyState } from "../actions";

const initial: ApplyState = {};

// 작가 신청 폼 — useActionState로 서버 검증 결과 표시
export function ApplyForm() {
  const [state, formAction, pending] = useActionState(
    applyAsPhotographer,
    initial
  );

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Field
        name="handle"
        label="핸들 (URL 주소)"
        placeholder="예: jiwon_film"
        hint="영문 소문자·숫자·_ 3~20자. /photographers/핸들 로 노출됩니다."
        error={state.fieldErrors?.handle}
      />
      <Field
        name="displayName"
        label="작가명"
        placeholder="예: 지원"
        error={state.fieldErrors?.displayName}
      />
      <div className="flex flex-col gap-1">
        <label htmlFor="bio" className="text-sm font-medium">
          소개
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={500}
          placeholder="필름 무드 · 자연광 인물 중심으로 작업해요."
          className="rounded-xl border border-fg/15 bg-white px-4 py-3 text-sm outline-none focus:border-fg/40"
        />
      </div>
      <Field
        name="regions"
        label="활동 지역"
        placeholder="성수, 한강 (쉼표로 구분)"
      />
      <Field
        name="moodTags"
        label="무드 태그"
        placeholder="필름, 내추럴, 에디토리얼 (쉼표로 구분)"
      />

      {state.error && <p className="text-sm text-brand">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 w-full rounded-xl bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "신청 중…" : "작가 신청하기"}
      </button>
      <p className="text-center text-xs text-fg/45">
        신청 후 운영자 승인을 거쳐 활동을 시작할 수 있어요.
      </p>
    </form>
  );
}

function Field({
  name,
  label,
  placeholder,
  hint,
  error,
}: {
  name: string;
  label: string;
  placeholder?: string;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        placeholder={placeholder}
        className="rounded-xl border border-fg/15 bg-white px-4 py-3 text-sm outline-none focus:border-fg/40"
      />
      {hint && !error && <p className="text-xs text-fg/45">{hint}</p>}
      {error && <p className="text-xs text-brand">{error}</p>}
    </div>
  );
}

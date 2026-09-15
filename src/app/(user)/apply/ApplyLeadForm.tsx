"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { submitPhotographerApplication } from "./actions";
import { ApplySubmitted } from "./ApplySubmitted";
import type { ApplyLeadState } from "./schema";

const initial: ApplyLeadState = {};

// 작가 신청 폼(공개) — 작가명·포트폴리오 링크·전화·소개 + 카카오 채널 단계
//
// `action` 은 기본이 실제 서버 액션이다. 주입할 수 있게 열어 둔 건 /dev/flow(샌드박스)가
// **같은 컴포넌트**를 쓰면서 저장만 localStorage 로 돌리기 위해서다 — 화면을 복제하면
// 둘이 조용히 어긋나고, 어긋난 쪽을 QA 하게 된다.
export function ApplyLeadForm({
  kakaoChannelUrl,
  defaultPhone = "",
  action = submitPhotographerApplication,
}: {
  kakaoChannelUrl: string;
  /**
   * 가입 때 이미 받아 둔 번호(profiles.phone). 카카오 간편가입이 번호까지 받아 오므로
   * **다시 입력시킬 이유가 없다.** 채워서 보여주되 고칠 수는 있게 둔다 —
   * 신청서의 번호는 운영자가 연락하는 곳이라 다른 번호를 쓰고 싶을 수 있다.
   */
  defaultPhone?: string;
  action?: (prev: ApplyLeadState, formData: FormData) => Promise<ApplyLeadState>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [name, setName] = useState("");

  // 제출 직후엔 폼도 채널 안내도 걷고 **완료 화면 하나만** 보여준다.
  // 전에는 초록 배너 + 폼 자리 + 채널 카드가 뒤섞여 무엇을 해야 하는지 흐렸다.
  if (state.ok) {
    return <ApplySubmitted displayName={name.trim() || "작가"} kakaoChannelUrl={kakaoChannelUrl} />;
  }

  return (
    <form action={formAction} className="mt-7 flex flex-col gap-5">
      <Field
        name="displayName"
        label="작가명"
        required
        placeholder="예: 지원"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={state.fieldErrors?.displayName}
      />
      <Field
        name="portfolioUrl"
        label="포트폴리오 링크"
        required
        placeholder="인스타·블로그 등 (예: instagram.com/...)"
        hint="작업을 볼 수 있는 링크를 남겨주세요."
        error={state.fieldErrors?.portfolioUrl}
      />
      <Field
        name="phone"
        label="전화번호"
        required
        type="tel"
        inputMode="tel"
        placeholder="010-1234-5678"
        defaultValue={defaultPhone}
        hint={defaultPhone ? "가입할 때 받은 번호예요. 다른 번호로 연락받으려면 고쳐주세요." : undefined}
        error={state.fieldErrors?.phone}
      />

      <div className="flex flex-col gap-2">
        <label htmlFor="bio" className="flex items-center gap-1.5 text-body-sm font-semibold">
          본인 소개 <span className="text-caption font-normal text-faint">선택</span>
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={500}
          placeholder="작업 스타일이나 소개를 자유롭게 적어주세요."
          className="resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-3 text-body outline-none transition-colors placeholder:text-faint focus:border-fg"
        />
      </div>

      {state.error && <p className="text-body-sm font-medium text-danger-ink">{state.error}</p>}

      <Button type="submit" variant="brand" size="lg" fullWidth loading={pending} className="mt-1">
        작가 신청 보내기
      </Button>
      <p className="text-center text-caption text-muted">
        보내면 운영자 검토 후 영업일 기준 1~2일 안에 결과를 알려드려요.
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
  required,
  type = "text",
  inputMode,
  value,
  defaultValue,
  onChange,
}: {
  name: string;
  label: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  type?: string;
  inputMode?: "tel" | "text";
  value?: string;
  defaultValue?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="flex items-center gap-1.5 text-body-sm font-semibold">
        {label}
        {required && <span className="text-caption font-medium text-brand-ink">필수</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        className="h-12 rounded-xl border border-line-strong bg-surface px-3.5 text-body outline-none transition-colors placeholder:text-faint focus:border-fg"
      />
      {error ? (
        <p className="text-caption text-danger-ink">{error}</p>
      ) : hint ? (
        <p className="text-caption leading-relaxed text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

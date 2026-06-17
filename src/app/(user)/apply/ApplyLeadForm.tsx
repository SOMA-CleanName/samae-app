"use client";

import { useActionState } from "react";
import { submitPhotographerApplication, type ApplyLeadState } from "./actions";

const initial: ApplyLeadState = {};

// 작가 신청 폼(공개) — 작가명·포트폴리오 링크·전화·소개 + 카카오 채널 단계
export function ApplyLeadForm({ kakaoChannelUrl }: { kakaoChannelUrl: string }) {
  const [state, formAction, pending] = useActionState(submitPhotographerApplication, initial);

  return (
    <div className="mt-6 flex flex-col gap-6">
      {state.ok ? (
        <div className="rounded-2xl border border-success/30 bg-success-soft p-5 text-center">
          <p className="text-base font-semibold text-success">신청이 접수됐어요!</p>
          <p className="mt-1.5 text-sm text-fg/70">아래 카카오 채널 단계까지 마치면 신청이 완료돼요.</p>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-4">
          <Field
            name="displayName"
            label="작가명"
            required
            placeholder="예: 지원"
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
            error={state.fieldErrors?.phone}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bio" className="flex items-center gap-1.5 text-sm font-medium text-fg/80">
              본인 소개 <span className="text-xs font-normal text-fg/40">선택</span>
            </label>
            <textarea
              id="bio"
              name="bio"
              rows={3}
              maxLength={500}
              placeholder="작업 스타일이나 소개를 자유롭게 적어주세요."
              className="resize-none rounded-xl border border-line-strong bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-fg/30 focus:border-fg/45"
            />
          </div>

          {state.error && <p className="text-sm font-medium text-brand">{state.error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="mt-1 w-full rounded-xl bg-fg py-3 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "보내는 중…" : "작가 신청 보내기"}
          </button>
        </form>
      )}

      {/* 카카오 채널 — 실제 신청 완료 단계 */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm font-semibold text-fg">
          {state.ok ? "마지막 단계예요!" : "카카오 채널로 신청 메시지 보내기"}
        </p>
        <ol className="mt-3 flex flex-col gap-3 text-sm text-fg/70">
          <li className="flex gap-2.5">
            <Num>1</Num>
            <div className="flex-1">
              <p>SAMAE 카카오 채널을 구독해주세요.</p>
              {kakaoChannelUrl ? (
                <a
                  href={kakaoChannelUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center rounded-xl bg-[#FEE500] px-4 py-2.5 text-sm font-semibold text-[#191600] transition-opacity hover:opacity-90"
                >
                  카카오 채널 구독하기
                </a>
              ) : (
                <span className="mt-2 inline-flex rounded-xl bg-fg/[0.06] px-4 py-2.5 text-sm text-fg/40">
                  채널 링크 준비중
                </span>
              )}
            </div>
          </li>
          <li className="flex gap-2.5">
            <Num>2</Num>
            <div className="flex-1">
              <p>채널 채팅으로 아래 메시지를 보내주세요.</p>
              <p className="mt-2 rounded-lg border border-line bg-bg px-3 py-2 font-medium text-fg">
                작가 등록 요청합니다!
              </p>
            </div>
          </li>
        </ol>
        <p className="mt-3 text-xs text-fg/45">운영자가 확인 후 카카오로 안내드려요.</p>
      </div>
    </div>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-fg text-[11px] font-bold text-bg">
      {children}
    </span>
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
}: {
  name: string;
  label: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  type?: string;
  inputMode?: "tel" | "text";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="flex items-center gap-1.5 text-sm font-medium text-fg/80">
        {label}
        {required && <span className="text-xs font-medium text-brand">필수</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        className="h-12 rounded-xl border border-line-strong bg-white px-4 text-sm outline-none transition-colors placeholder:text-fg/30 focus:border-fg/45"
      />
      {error ? (
        <p className="text-xs text-brand">{error}</p>
      ) : hint ? (
        <p className="text-xs text-fg/45">{hint}</p>
      ) : null}
    </div>
  );
}

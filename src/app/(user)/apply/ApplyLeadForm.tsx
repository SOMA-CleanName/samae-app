"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
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
  // 입력값을 붙잡아 둔다 — 액션이 실패하면 폼이 다시 그려지는데, 값을 안 들고 있으면
  // **적어둔 게 통째로 날아간다.** 긴 링크를 다시 붙여넣게 만드는 건 사과가 아니라 벌이다
  // (2026-09-16 신고: 신청 실패할 때마다 포폴 링크가 비워짐).
  const [name, setName] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");

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
        value={portfolioUrl}
        onChange={(e) => setPortfolioUrl(e.target.value)}
        error={state.fieldErrors?.portfolioUrl}
      />
      {/* 이미 인증한 번호가 있으면 **입력란을 띄우지 않는다.**
          가입 때 카카오 동의나 문자 인증으로 받아 둔 번호를 또 치게 할 이유가 없다.
          서버도 화면이 보낸 값을 믿지 않고 profiles.phone 을 쓴다(actions.ts) — 고쳐도
          반영되지 않는 입력란을 두면 그게 거짓말이 된다. */}
      {defaultPhone ? (
        <div className="flex flex-col gap-2">
          <span className="text-body-sm font-semibold">전화번호</span>
          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
            <CheckBadge />
            <span className="text-body tabular-nums">{formatPhone(defaultPhone)}</span>
            <span className="ml-auto text-caption text-muted">인증됨</span>
          </div>
          <p className="text-caption leading-relaxed text-muted">
            가입할 때 인증한 번호예요. 바꾸려면{" "}
            <Link href="/settings" className="underline underline-offset-2 hover:text-fg">
              계정 설정
            </Link>
            에서 변경해주세요.
          </p>
        </div>
      ) : (
        <Field
          name="phone"
          label="전화번호"
          required
          type="tel"
          inputMode="tel"
          placeholder="010-1234-5678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={state.fieldErrors?.phone}
        />
      )}

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
          value={bio}
          onChange={(e) => setBio(e.target.value)}
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

/** 010-1234-5678 로 보기 좋게 — 저장은 숫자만 한다 */
function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

function CheckBadge() {
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success-soft text-success-ink">
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3.5}>
        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

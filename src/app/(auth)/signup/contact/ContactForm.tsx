"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mpTrack } from "@/lib/mixpanel";
import { formatPhoneInput, validateContact } from "@/lib/inquiry-bot";
import {
  requestPhoneCode,
  verifyPhoneCode,
  type RequestCodeState,
  type VerifyCodeState,
} from "./actions";
import { CheckIcon } from "@/components/user/icons";

// 가입 마무리 — 전화번호 OTP 2단계: ①번호 입력→인증번호 받기 ②6자리 확인→저장.
// 문자가 실제로 도착하는 번호만 저장한다 (답장 SMS 알림의 도달 보장).
export default function ContactForm({
  next,
  displayName,
}: {
  next: string;
  displayName: string | null;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  const [reqState, requestAction, requesting] = useActionState<RequestCodeState | null, FormData>(
    requestPhoneCode,
    null
  );
  const [verState, verifyAction, verifying] = useActionState<VerifyCodeState | null, FormData>(
    verifyPhoneCode,
    null
  );

  // 발송 성공 → 코드 단계 (서버가 정규화한 번호를 기준으로)
  const sentPhone = reqState?.ok ? reqState.phone ?? null : null;
  const codeStage = !!sentPhone;

  const { valid } = validateContact("phone", phone);

  useEffect(() => {
    mpTrack("View Signup Contact", { next_path: next.split("?")[0] });
  }, [next]);

  // 발송 직후 — 쿨다운 시작 + 코드 입력에 포커스
  useEffect(() => {
    if (reqState?.ok) {
      setCooldown(60);
      setCode("");
      codeRef.current?.focus();
    } else if (reqState?.retryAfterSec) {
      setCooldown(reqState.retryAfterSec);
    }
  }, [reqState]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // 인증 성공 → 하던 흐름으로 복귀
  useEffect(() => {
    if (verState?.ok) {
      mpTrack("Submit Signup Contact");
      router.replace(next);
      router.refresh();
    }
  }, [verState, next, router]);

  return (
    <main className="mx-auto flex min-h-[100svh] w-full max-w-sm flex-col bg-surface px-6 pb-8 pt-4 font-kr">
      {/* 필수 단계라 뒤로가기 없음 — 헤드라인·폼을 상단에 붙여 키보드에 안 가리게 */}
      <div className="mt-12">
        <p className="font-display text-xl italic text-brand">samae</p>
        <h1 className="mt-4 whitespace-pre-line text-[1.75rem] font-bold leading-[1.3] tracking-tight">
          {`${displayName ? `${displayName}님,\n` : ""}거의 다 왔어요`}
        </h1>
        <p className="mt-3 text-body-sm leading-relaxed text-muted">
          작가님이 답장을 남기면 <strong className="font-semibold text-fg">문자로 알려드려요.</strong>
          <br />
          알림받을 전화번호를 인증해 주세요.
        </p>
      </div>

      {/* ① 번호 입력 + 인증번호 받기 */}
      <form action={requestAction} className="mt-8 flex flex-col gap-2.5">
        <div className="flex gap-2">
          <input
            type="tel"
            name="phone"
            inputMode="tel"
            autoComplete="tel"
            autoFocus
            required
            placeholder="010-1234-5678"
            value={phone}
            disabled={codeStage}
            onChange={(e) => {
              setPhone(formatPhoneInput(e.target.value));
              setTouched(true);
            }}
            className="min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-4 py-3.5 text-body tabular-nums outline-none transition-colors focus:border-fg/40 disabled:bg-fg/[0.04] disabled:text-muted"
          />
          {codeStage ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="shrink-0 cursor-pointer rounded-xl border border-line-strong px-4 text-body-sm font-semibold text-fg transition-colors hover:bg-fg/[0.04]"
            >
              번호 수정
            </button>
          ) : (
            <button
              type="submit"
              disabled={!valid || requesting || cooldown > 0}
              className="shrink-0 cursor-pointer rounded-xl bg-fg px-4 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {requesting ? "발송 중…" : cooldown > 0 ? `${cooldown}초` : "인증번호 받기"}
            </button>
          )}
        </div>
        {touched && phone && !valid && !codeStage && (
          <p className="text-caption text-danger">010으로 시작하는 11자리를 입력해주세요.</p>
        )}
        {reqState && !reqState.ok && reqState.error && (
          <p className="text-caption text-danger">{reqState.error}</p>
        )}
      </form>

      {/* ② 인증번호 확인 */}
      {codeStage && (
        <form action={verifyAction} className="mt-3 flex flex-col gap-2.5">
          <input type="hidden" name="phone" value={sentPhone ?? ""} />
          <div className="flex gap-2">
            <input
              ref={codeRef}
              type="text"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              placeholder="인증번호 6자리"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-4 py-3.5 text-body tracking-[0.2em] tabular-nums outline-none transition-colors focus:border-fg/40"
            />
            <button
              type="submit"
              disabled={code.length !== 6 || verifying}
              className="shrink-0 cursor-pointer rounded-xl bg-fg px-5 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {verifying ? "확인 중…" : "확인"}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-caption text-faint">
              문자가 안 오면{" "}
              <button
                type="submit"
                formAction={requestAction}
                disabled={cooldown > 0 || requesting}
                className="cursor-pointer font-semibold text-muted underline underline-offset-2 transition-colors hover:text-fg disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50"
              >
                {cooldown > 0 ? `다시 받기 (${cooldown}초)` : "다시 받기"}
              </button>
            </p>
            {reqState?.devCode && (
              <span className="rounded-md bg-fg/[0.07] px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                dev 코드: {reqState.devCode}
              </span>
            )}
          </div>
          {verState && !verState.ok && verState.error && (
            <p className="text-caption text-danger">{verState.error}</p>
          )}
        </form>
      )}

      <p className="mt-4 flex items-start gap-1.5 text-caption leading-relaxed text-faint">
        <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
        번호는 답장 알림에만 쓰여요. 광고 문자는 보내지 않아요.
      </p>
      <p className="mt-2 text-caption leading-relaxed text-faint">
        인증을 완료하면 문의 시 작가에게 연락처가 전달되는 것과 상담을 위한{" "}
        <a href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-muted">
          개인정보 수집·이용
        </a>
        에 동의하게 됩니다.
      </p>
    </main>
  );
}

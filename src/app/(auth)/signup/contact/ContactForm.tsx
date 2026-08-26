"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { mpTrack } from "@/lib/mixpanel";
import { formatPhoneInput, validateContact } from "@/lib/inquiry-bot";
import { saveContactPhone, type SaveContactState } from "./actions";
import { CheckIcon } from "@/components/user/icons";

const INITIAL: SaveContactState = { ok: false, error: null };

// 가입 마무리 폼 — 전화번호 하나만. "왜 필요한지"(작가 답장 문자 알림)가 첫 줄에 보이게.
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
  const [state, formAction, pending] = useActionState(saveContactPhone, INITIAL);

  const { valid, error: inputError } = validateContact("phone", phone);

  useEffect(() => {
    mpTrack("View Signup Contact", { next_path: next.split("?")[0] });
  }, [next]);

  // 저장 성공 → 하던 흐름으로 복귀
  useEffect(() => {
    if (state.ok) {
      mpTrack("Submit Signup Contact");
      router.replace(next);
      router.refresh();
    }
  }, [state.ok, next, router]);

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
          알림받을 전화번호 하나만 남겨주세요.
        </p>
      </div>

      <form action={formAction} className="mt-8 flex flex-col gap-2.5">
        <input
          type="tel"
          name="phone"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          required
          placeholder="010-1234-5678"
          value={phone}
          onChange={(e) => {
            setPhone(formatPhoneInput(e.target.value));
            setTouched(true);
          }}
          className="rounded-xl border border-line-strong bg-surface px-4 py-3.5 text-body tabular-nums outline-none transition-colors focus:border-fg/40"
        />
        {touched && phone && inputError && <p className="text-caption text-danger">{inputError}</p>}
        {state.error && <p className="text-caption text-danger">{state.error}</p>}
        <button
          type="submit"
          disabled={!valid || pending}
          className="mt-1 w-full cursor-pointer rounded-xl bg-fg py-3.5 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "저장 중…" : "완료하고 이어가기"}
        </button>
      </form>

      <p className="mt-4 flex items-start gap-1.5 text-caption leading-relaxed text-faint">
        <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
        번호는 답장 알림에만 쓰여요. 광고 문자는 보내지 않아요.
      </p>
    </main>
  );
}

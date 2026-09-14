"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { agreeTerms } from "./actions";

export function ConsentForm({
  next,
  termsVersion,
  action = agreeTerms,
}: {
  next: string;
  termsVersion: string;
  /**
   * 기본은 실제 서버 액션. 주입할 수 있게 연 건 /dev/flow(샌드박스)가 **같은 컴포넌트**를
   * 쓰면서 저장만 localStorage 로 돌리기 위해서다 — 복제하면 조용히 어긋난다.
   */
  action?: (formData: FormData) => Promise<void>;
}) {
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const both = terms && privacy;

  return (
    <form action={action} className="mt-6">
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-2">
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line p-3.5 has-[:checked]:border-fg">
          <input
            id="consent-terms"
            type="checkbox"
            name="terms"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
          />
          <span className="text-sm leading-relaxed text-fg">
            <b className="font-semibold">(필수)</b>{" "}
            <Link href="/terms" target="_blank" className="underline underline-offset-2">
              서비스 이용약관
            </Link>
            에 동의합니다
            <span className="block text-xs text-faint">시행일 {termsVersion} 버전</span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line p-3.5 has-[:checked]:border-fg">
          <input
            id="consent-privacy"
            type="checkbox"
            name="privacy"
            checked={privacy}
            onChange={(e) => setPrivacy(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
          />
          <span className="text-sm leading-relaxed text-fg">
            <b className="font-semibold">(필수)</b>{" "}
            <Link href="/privacy" target="_blank" className="underline underline-offset-2">
              개인정보 처리방침
            </Link>
            에 동의합니다
          </span>
        </label>
      </div>

      <button
        type="button"
        onClick={() => {
          setTerms(true);
          setPrivacy(true);
        }}
        className="mt-3 text-xs text-muted underline underline-offset-2"
      >
        모두 동의
      </button>

      <Submit disabled={!both} />
    </form>
  );
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="mt-4 w-full cursor-pointer rounded-full bg-fg py-3 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
    >
      {pending ? "처리 중…" : "동의하고 계속"}
    </button>
  );
}

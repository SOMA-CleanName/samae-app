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
  // 광고성 정보 수신은 **선택**이다. 제출 조건(both)에 절대 넣지 않는다 —
  // 넣는 순간 "동의해야 가입되는" 구조가 되어 정보통신망법 §50 위반이다.
  const [marketing, setMarketing] = useState(false);
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
            <Link href="/terms?plain=1" target="_blank" className="underline underline-offset-2">
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
            <Link href="/privacy?plain=1" target="_blank" className="underline underline-offset-2">
              개인정보 처리방침
            </Link>
            에 동의합니다
          </span>
        </label>

        {/*
          (선택) 광고성 정보 수신 — 정보통신망법 §50. 필수 둘과 **시각적으로 떨어뜨리고**
          기본값은 꺼둔다. 미리 체크해두면 동의로 치지 않는다.
        */}
        <label className="mt-1 flex cursor-pointer items-start gap-2.5 rounded-xl border border-line/60 p-3.5 has-[:checked]:border-fg">
          <input
            id="consent-marketing"
            type="checkbox"
            name="marketing"
            checked={marketing}
            onChange={(e) => setMarketing(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
          />
          <span className="text-sm leading-relaxed text-muted">
            <b className="font-semibold text-fg">(선택)</b> 이벤트·혜택 소식을 받아볼래요
            <span className="block text-xs text-faint">
              동의하지 않아도 가입할 수 있어요. 예약·입금 같은 안내는 동의와 무관하게 보내드려요.
            </span>
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
        {/* 선택 항목은 일부러 빼둔다 — "모두 동의" 한 번에 광고 수신까지 딸려가면
            눌러놓고 몰랐다는 말이 나온다. 라벨도 그에 맞게 바꿨다. */}
        필수 항목 모두 동의
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

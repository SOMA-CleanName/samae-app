"use client";

import { useActionState, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { setOauthNextCookie } from "@/lib/safe-redirect-client";
import { sendTestMemo, type MemoResult } from "./actions";

// dev 전용 실험 UI — ① talk_message 동의 포함 재로그인 → ② 나에게 테스트 발송 → 핸드폰 확인
export default function KakaoMemoTest({ hasToken }: { hasToken: boolean }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [result, formAction, pending] = useActionState<MemoResult, FormData>(sendTestMemo, null);

  async function onRelogin() {
    setLoading(true);
    setOauthNextCookie("/dev/kakao-memo"); // 콜백 후 이 페이지로 복귀
    await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        scopes: "talk_message", // 카카오톡 메시지 전송 동의 요청 (기존 동의에 추가로 뜸)
      },
    });
  }

  return (
    <main className="mx-auto flex min-h-[100svh] w-full max-w-sm flex-col gap-5 bg-surface px-6 py-10 font-kr">
      <div>
        <h1 className="text-h1 font-semibold">카카오 나에게 보내기 실험</h1>
        <p className="mt-1.5 text-body-sm text-muted">
          dev 전용. ① 메시지 권한 포함 재로그인 → ② 테스트 발송 → 핸드폰 카톡에서{" "}
          <strong className="font-semibold text-fg">푸시가 뜨는지</strong>·어떻게 보이는지 확인.
        </p>
      </div>

      <div className="rounded-xl border border-line p-4">
        <p className="text-caption text-muted">
          토큰 상태:{" "}
          {hasToken ? (
            <strong className="font-semibold text-success">확보됨 — ②로 진행</strong>
          ) : (
            <strong className="font-semibold text-danger">없음 — ①부터</strong>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={onRelogin}
        disabled={loading}
        className="w-full cursor-pointer rounded-xl bg-[#FEE500] py-3.5 text-body-sm font-semibold text-[#191600] hover:opacity-90 disabled:opacity-60"
      >
        {loading ? "카카오로 이동 중…" : "① 메시지 권한 포함 재로그인"}
      </button>

      <form action={formAction} className="flex flex-col gap-2.5">
        <input
          type="url"
          name="chatUrl"
          defaultValue="https://samae.co.kr"
          placeholder="버튼이 열 링크 (채팅방 URL)"
          className="rounded-xl border border-line-strong bg-surface px-4 py-3 text-body-sm outline-none focus:border-fg/40"
        />
        <button
          type="submit"
          disabled={pending || !hasToken}
          className="w-full cursor-pointer rounded-xl bg-fg py-3.5 text-body-sm font-semibold text-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "발송 중…" : "② 나에게 테스트 발송"}
        </button>
      </form>

      {result && (
        <pre className="overflow-x-auto rounded-xl bg-fg/[0.05] p-4 text-caption leading-relaxed">
          {`ok: ${result.ok}\nstatus: ${result.status}\n${result.body}`}
        </pre>
      )}

      <p className="text-caption leading-relaxed text-faint">
        체크리스트: 잠금화면/백그라운드에서 푸시 알림이 뜨는가 · 발신이 &ldquo;나와의 채팅&rdquo;으로
        보이는가 · 버튼 탭 시 링크가 열리는가 · 재수신(연속 2건) 시 묶임 여부
      </p>
    </main>
  );
}

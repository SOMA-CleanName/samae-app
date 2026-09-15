"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";

// 신청 접수 완료 — **두 자리에서 같은 화면을 쓴다.**
//
//   · 폼을 막 제출한 직후 (폼 자리를 이 화면이 대신한다)
//   · 신청해 둔 사람이 /apply 를 다시 열었을 때
//
// 전에는 그 둘이 다른 화면이었다. 제출 직후엔 초록 배너 한 줄, 다시 열면 노란 카드 —
// **같은 상태인데 두 번 다르게 보였다.** 하나로 합친다.
//
// 승인 전에는 스튜디오가 열리지 않는다(작가 행이 없어 프로필 탭에 [스튜디오]가 안 생긴다).
// 그래서 여기서 할 일은 하나뿐이다: 카카오 채널로 메시지 보내기. 그게 끝나면 홈으로 보낸다.

export function ApplySubmitted({
  displayName,
  kakaoChannelUrl,
}: {
  displayName: string;
  kakaoChannelUrl: string;
}) {
  const message = `${displayName} 작가 등록 요청합니다.`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      // clipboard API 가 막힌 환경(비보안 컨텍스트 등) — 선택으로 대체한다
      const el = document.createElement("textarea");
      el.value = message;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="mt-8 flex flex-col gap-7">
      <section>
        <span className="grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success-ink">
          <CheckIcon />
        </span>
        <h2 className="mt-4 text-h2 font-bold tracking-tight">신청이 접수됐어요</h2>
        <p className="mt-2.5 text-body leading-relaxed text-muted">
          운영자 검토 후 <b className="font-semibold text-fg">영업일 기준 1~2일</b> 안에 결과를
          알려드려요. 승인되면 사진을 올릴 수 있는 스튜디오가 열려요.
        </p>
      </section>

      {/* 남은 한 가지 — 채널로 메시지 보내기 */}
      <section className="rounded-2xl border border-line p-5">
        <p className="text-body font-semibold">조금 더 빠르게 받아보려면</p>
        <p className="mt-1.5 text-body-sm leading-relaxed text-muted">
          카카오 채널로 아래 메시지를 보내주시면 운영자가 먼저 확인해요. 안 보내셔도 검토는 진행돼요.
        </p>

        <div className="mt-4 flex flex-col gap-2.5">
          <div className="flex items-stretch gap-2">
            <p className="min-w-0 flex-1 truncate rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-body-sm">
              {message}
            </p>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 cursor-pointer rounded-xl border border-line-strong bg-surface px-4 text-body-sm font-semibold transition-colors hover:bg-surface-2"
            >
              {copied ? "복사됨" : "복사"}
            </button>
          </div>

          {kakaoChannelUrl ? (
            <a
              href={kakaoChannelUrl}
              target="_blank"
              rel="noreferrer"
              className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#FEE500] px-4 py-3.5 text-body-sm font-semibold text-[#191600] transition hover:opacity-90"
            >
              <KakaoIcon />
              카카오 채널 열기
            </a>
          ) : (
            <p className="rounded-xl bg-surface-2 px-4 py-3.5 text-center text-body-sm text-faint">
              채널 링크 준비중
            </p>
          )}
        </div>
      </section>

      <div className="flex flex-col gap-2.5">
        <Button href="/" variant="secondary" size="lg" fullWidth>
          홈으로 돌아가기
        </Button>
        <p className="text-center text-caption text-muted">
          결과는 카카오로 알려드려요.{" "}
          <Link href="/terms/fees" className="underline underline-offset-2 hover:text-fg">
            수수료·정산 정책
          </Link>
          을 미리 읽어두셔도 좋아요.
        </p>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KakaoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden>
      <path d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.26 4.66 6.66l-.97 3.6c-.05.2.07.4.27.44a.4.4 0 0 0 .3-.05l4.3-2.85c.47.05.95.08 1.44.08 5.52 0 10-3.54 10-7.88C22 6.54 17.52 3 12 3Z" />
    </svg>
  );
}

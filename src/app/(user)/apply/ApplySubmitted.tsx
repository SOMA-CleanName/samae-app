"use client";

import { useState } from "react";
import { openKakaoChannel } from "@/lib/kakao-channel";
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
// 그래서 여기서 할 일은 하나뿐이다: **카카오 채널로 메시지 보내기.**
//
// ⚠️ 이건 선택이 아니라 **필수**다. 카카오 채널은 **사용자가 먼저 말을 걸어야** 우리가
//    답할 수 있다(채널 정책). 작가가 안 보내면 승인이 나도 연락할 수단이 없다 —
//    전에는 "조금 더 빠르게 받아보려면 ... 안 보내셔도 검토는 진행돼요" 라고 적어서
//    안 해도 되는 일처럼 보였다. 그러면 연락 못 하는 신청이 쌓인다.
//
//    다만 **보냈는지 우리가 확인할 방법은 없다**(채널 대화는 우리 DB 밖이다). 그래서
//    기술적으로 막는 대신, 보냈다고 확인해야 다음으로 넘어가게 한다. 억지로 막으면
//    빠져나갈 길 없는 화면이 되고, 확인 버튼은 "안 했다" 는 사실을 본인이 알게 한다.

export function ApplySubmitted({
  displayName,
  kakaoChannelUrl,
}: {
  displayName: string;
  kakaoChannelUrl: string;
}) {
  const message = `${displayName} 작가 등록 요청합니다.`;
  const [copied, setCopied] = useState(false);
  const [opened, setOpened] = useState(false); // 채널을 열어는 봤는가 (문구만 바꾼다)
  const [sent, setSent] = useState(false); // 보냈다고 본인이 확인했는가

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

      {/* 마지막 필수 단계 — 채널 메시지. 이게 없으면 우리가 연락할 수단이 없다 */}
      <section className="rounded-2xl border border-brand/30 bg-brand-soft p-5">
        <p className="text-label uppercase tracking-wide text-brand-ink">마지막 단계 · 필수</p>
        <p className="mt-2 text-body font-semibold">카카오 채널로 이 메시지를 보내주세요</p>
        <p className="mt-1.5 text-body-sm leading-relaxed text-muted">
          카카오 채널은 <b className="font-semibold text-fg">작가님이 먼저 말을 걸어야</b> 저희가
          답할 수 있어요. 안 보내시면 승인이 나도 연락드릴 방법이 없어요.
        </p>

        <div className="mt-4 flex items-stretch gap-2">
          <p className="min-w-0 flex-1 truncate rounded-xl border border-line bg-surface px-3.5 py-3 text-body-sm">
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

        {/* ⚠️ 새 탭으로 열지 않는다. 그러면 카카오톡에 다녀온 뒤 **원래 탭이 사라진다**
            (2026-09-17 신고). 앱 스킴으로 같은 탭에서 넘어가면 브라우저는 그 자리에
            남고, 돌아왔을 때 이 화면이 그대로 있다(lib/kakao-channel). */}
        {kakaoChannelUrl ? (
          <button
            type="button"
            onClick={() => {
              setOpened(true);
              openKakaoChannel(kakaoChannelUrl);
            }}
            className="mt-2.5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#FEE500] px-4 py-3.5 text-body-sm font-semibold text-[#191600] transition hover:opacity-90"
          >
            <KakaoIcon />
            카카오 채널 열고 보내기
          </button>
        ) : (
          <p className="mt-2.5 rounded-xl bg-surface px-4 py-3.5 text-center text-body-sm text-danger-ink">
            채널 링크가 설정되지 않았어요. 운영자에게 알려주세요.
          </p>
        )}
      </section>

      {/* 보냈다고 확인해야 홈으로 넘어간다 — 우리가 확인할 방법이 없으니 본인이 짚게 한다 */}
      <div className="flex flex-col gap-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={sent}
            onChange={(e) => setSent(e.target.checked)}
            className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-brand"
          />
          <span className="text-body-sm leading-relaxed text-muted">
            카카오 채널로 메시지를 <b className="font-semibold text-fg">보냈어요</b>
          </span>
        </label>

        {/* Button 은 href 가 있으면 <Link> 라 disabled 를 못 받는다 —
            잠긴 동안은 링크가 아예 아니어야 키보드·새 탭으로도 못 빠져나간다 */}
        {sent ? (
          <Button href="/" variant="secondary" size="lg" fullWidth>
            홈으로 돌아가기
          </Button>
        ) : (
          <Button type="button" variant="secondary" size="lg" fullWidth disabled>
            홈으로 돌아가기
          </Button>
        )}
        {!sent && (
          <p className="text-center text-caption text-muted">
            {opened
              ? "메시지를 보내셨다면 위를 체크해주세요."
              : "채널로 메시지를 보낸 뒤 위를 체크해주세요."}
          </p>
        )}
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

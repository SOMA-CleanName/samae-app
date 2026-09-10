"use client";

// 채팅방 상단 — "번호가 없어서 알림을 못 받는 중" 알림줄.
//
// 채팅방이 이 배너의 자리인 이유: 여기가 **알림이 실제로 필요해지는 곳**이다.
// 설정 화면에 묻어 두면 아무도 안 본다. 상대가 답장을 남겼는데 못 받는 사람에게는
// 지금 이 방이 그 사실을 알려 줄 유일한 자리다.
//
// 번호가 채워지면 서버가 이 배너를 아예 안 그린다 → 스스로 사라진다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { KakaoPhoneConsentButton } from "@/components/user/KakaoPhoneConsentButton";

/** 세션당 한 번만 접을 수 있다 — 창을 닫으면 다시 뜬다(중요한 안내라 영구히 숨기지 않는다) */
const DISMISS_KEY = "samae:phone-consent-banner-dismissed";

export function PhoneConsentBanner({
  conversationId,
  canAskKakao,
}: {
  conversationId: string;
  /** 카카오 재동의가 가능한가. 아니면 OTP 로 보낸다 (판정은 lib/phone-consent) */
  canAskKakao: boolean;
}) {
  // 서버 렌더에는 항상 보이게 두고, 접힌 상태는 마운트 후에 반영한다
  // (sessionStorage 를 렌더 중에 읽으면 hydration 이 어긋난다)
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
  }, []);
  if (dismissed) return null;

  const next = `/chat/${conversationId}`;

  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-line bg-brand/[0.06] px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-caption font-semibold text-fg">
          답장이 와도 알림을 못 받고 있어요
        </p>
        <p className="mt-0.5 text-caption leading-relaxed text-muted">
          {canAskKakao
            ? "카카오톡으로 알려드릴게요. 광고는 보내지 않아요."
            : "알림받을 번호를 인증하면 카카오톡으로 알려드려요."}
        </p>
      </div>

      {canAskKakao ? (
        <KakaoPhoneConsentButton next={next} context="chat_banner" label="알림 받기" size="sm" />
      ) : (
        <Link
          href={`/signup/contact?next=${encodeURIComponent(next)}`}
          className="shrink-0 rounded-xl bg-fg px-3 py-2 text-caption font-semibold text-bg transition-opacity hover:opacity-90"
        >
          번호 인증
        </Link>
      )}

      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
        aria-label="알림 안내 접기"
        className="shrink-0 cursor-pointer rounded-lg p-1 text-muted transition-colors hover:bg-fg/[0.06] hover:text-fg"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

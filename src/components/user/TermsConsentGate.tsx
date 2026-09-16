"use client";

// 약관 동의가 없으면 **어느 화면에서든 앞을 막는다.**
//
// 전에는 `/signup/consent` 가 로그인 직후나 스튜디오 진입처럼 특정 길목에서만 떴다.
// 그래서 이미 로그인해 둔 사람은 약관을 개정해도 모르고 계속 썼다 — 개정 절차를 밟아도
// 정작 동의는 안 받는 상태가 된다(회원약관 3조).
//
// 리다이렉트가 아니라 **덮개**로 만든 이유:
//   · 리다이렉트는 고리를 만들기 쉽다. 약관 지면·정적 지면까지 예외를 일일이 뚫어야 한다
//   · 보던 화면이 남아 있어야 "왜 갑자기 튕겼지" 가 안 된다
//   · 닫을 수 없으므로 막는 효과는 리다이렉트와 같다
//
// ── 여기서 카카오로 보내지 않는다 ────────────────────────────────
// 이 덮개가 보이는 사람은 **이미 로그인해 있다** = 카카오 앱과 이미 연결돼 있다.
// 카카오는 간편가입 약관 화면을 **최초 연결 때만** 띄운다(REST API 문서). 그래서
// 여기서 카카오로 보내면 동의 화면 없이 그대로 되돌아오고, 덮개가 또 뜬다.
// 실측(2026-09-16)에서 정확히 그랬다 — 왕복만 하고 아무것도 안 받아졌다.
//
// 게다가 그 왕복 하나가 액세스 토큰 발급 1회라 사용자당 10분 20개 제한을 태운다.
// 실제로 태워서 `KOE237` 로 로그인이 통째로 죽었다.
//
// 그래서 기존 회원의 약관 동의는 **우리 화면 하나로만** 받는다(/signup/consent).
// 카카오에서 받는 건 가입 순간뿐이고, 그건 SignupForm·LoginForm 이 `service_terms` 로 한다.

import { usePathname } from "next/navigation";

export function TermsConsentGate({ revisit }: { revisit: boolean }) {
  const pathname = usePathname();

  // 동의 흐름 자체와 인증 지면에서는 덮지 않는다 — 덮으면 동의를 할 수가 없다
  if (
    pathname.startsWith("/signup") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/privacy")
  ) {
    return null;
  }

  // 돌아올 곳으로 **지금 경로**를 넘긴다. 동의하고 나면 하던 자리로 돌아온다.
  const next = `/signup/consent?next=${encodeURIComponent(pathname)}`;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 font-kr"
      role="dialog"
      aria-modal="true"
      aria-label="약관 동의 필요"
    >
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-pop">
        <p className="text-title font-semibold text-fg">
          {revisit ? "약관이 개정됐어요" : "약관에 동의해 주세요"}
        </p>
        <p className="mt-2 text-body-sm leading-relaxed text-muted">
          {revisit
            ? "서비스 이용약관과 개인정보 처리방침이 새로 확정됐어요. 바뀐 내용을 확인하고 동의해 주셔야 계속 이용하실 수 있어요."
            : "사매를 이용하려면 서비스 이용약관과 개인정보 처리방침에 동의가 필요해요."}
        </p>

        <a
          href={next}
          className="mt-5 flex w-full cursor-pointer items-center justify-center rounded-xl bg-fg py-3.5 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90"
        >
          확인하고 동의하기
        </a>

        <p className="mt-3 text-center text-caption leading-relaxed text-faint">
          <a href="/terms" target="_blank" className="underline underline-offset-2 hover:text-muted">
            이용약관
          </a>
          {" · "}
          <a href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-muted">
            개인정보 처리방침
          </a>
        </p>
      </div>
    </div>
  );
}

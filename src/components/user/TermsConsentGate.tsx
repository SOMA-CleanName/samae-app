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

// ── 동의하지 않는 사람에게도 나갈 길이 있어야 한다 ──────────────
// 회원약관 부칙: "동의하지 않는 회원은 시행일 전에 이용계약을 해지할 수 있습니다."
// 그런데 이 덮개가 `/settings` 까지 덮어서 **탈퇴 버튼에 닿을 수가 없었다**(2026-09-17 점검).
// 덮개 안에도 로그아웃이 없어 앱을 아예 빠져나갈 수 없는 상태였다.
//
// 그래서 둘을 연다 — `/settings` 는 면제하고(탈퇴하러 가는 길), 덮개에 로그아웃을 둔다.
// 막는 효과는 그대로다: 동의 없이는 어차피 다른 화면이 전부 덮인다.

import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions/auth";

export function TermsConsentGate({ revisit }: { revisit: boolean }) {
  const pathname = usePathname();

  // 동의 흐름 자체와 인증 지면에서는 덮지 않는다 — 덮으면 동의를 할 수가 없다.
  // `/settings` 는 **나가는 문**이라 연다. 동의를 거부한 사람이 탈퇴할 자리다.
  if (
    pathname.startsWith("/signup") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/settings")
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

        {/* ⚠️ 문구가 동작과 어긋나면 안 된다. "확인하고 동의하기" 였는데, 누르는 순간
            동의가 되는 줄 알았다는 신고가 있었다(2026-09-16). 실제로는 동의 화면으로
            **이동만** 한다. 동의는 그 다음 화면에서 체크 두 개로 받는다 —
            누르는 것만으로 동의가 되면 설명 의무를 못 채운다(약관규제법 3조). */}
        <a
          href={next}
          className="mt-5 flex w-full cursor-pointer items-center justify-center rounded-xl bg-fg py-3.5 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90"
        >
          약관 확인하러 가기
        </a>

        {/* 동의하지 않을 자유가 실제로 있어야 한다. 기존 회원에게는 탈퇴까지 안내한다 —
            약관 부칙이 "동의하지 않는 회원은 이용계약을 해지할 수 있다" 고 적어 뒀다 */}
        <form action={signOut} className="mt-2">
          <button
            type="submit"
            className="w-full cursor-pointer rounded-xl py-2.5 text-body-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            {revisit ? "동의하지 않고 로그아웃" : "로그아웃"}
          </button>
        </form>

        {revisit && (
          <p className="mt-1 text-center text-caption leading-relaxed text-faint">
            계속 이용하지 않으시려면{" "}
            <a href="/settings" className="underline underline-offset-2 hover:text-muted">
              설정에서 탈퇴
            </a>
            하실 수 있어요.
          </p>
        )}

        <p className="mt-3 text-center text-caption leading-relaxed text-faint">
          {/* ?plain=1 — 읽으러 연 탭에서 푸터를 타고 홈으로 새지 않게 (ConsentForm 과 같은 규칙) */}
          <a href="/terms?plain=1" target="_blank" className="underline underline-offset-2 hover:text-muted">
            이용약관
          </a>
          {" · "}
          <a href="/privacy?plain=1" target="_blank" className="underline underline-offset-2 hover:text-muted">
            개인정보 처리방침
          </a>
        </p>
      </div>
    </div>
  );
}

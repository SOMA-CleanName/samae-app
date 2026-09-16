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
// ── 퍼널은 하나다 ────────────────────────────────────────────────
// 카카오 계정이면 **이 팝업의 버튼이 곧 카카오 동의 트리거**다. 예전엔 여기서
// `/signup/consent` 로 보내고 거기서 또 버튼을 누르게 했다 — 같은 일을 하는 화면이
// 둘이었고, 사용자는 버튼을 두 번 눌렀다.
//
// ⚠️ **여기서 자동으로 카카오에 보내지 않는다.** 실측(2026-09-16)에서 자동 이동은
//    클릭 한 번에 카카오 왕복 3회를 만들었고, 왕복 하나가 토큰 발급 1회라
//    사용자당 10분 20개 제한을 태워 `KOE237` 로 로그인이 통째로 죽었다.
//    사람이 누른 만큼만 나간다 — 그게 상한이다.
//
// 카카오에 한 번 보냈는데도 동의가 안 잡혔으면(`exhausted`) 더 보내지 않고
// 우리 체크박스 폼으로 보낸다. 같은 길로 또 보내봐야 결과는 같고 쿼터만 탄다.

import { usePathname } from "next/navigation";
import { KakaoTermsConsentButton } from "./KakaoTermsConsentButton";

export function TermsConsentGate({
  revisit,
  kakaoTags,
  exhausted,
}: {
  /** 첫 동의가 아니라 개정에 따른 재동의인가 */
  revisit: boolean;
  /**
   * 카카오 계정이고 간편가입 태그가 설정돼 있으면 그 값. 아니면 null —
   * 이메일 계정이거나 KAKAO_TERMS_TAGS 가 비어 있다는 뜻이라 체크박스 폼으로 간다.
   */
  kakaoTags: string | null;
  /** 이미 카카오로 보냈는데 동의가 안 잡힌 상태인가 */
  exhausted: boolean;
}) {
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

  const viaKakao = !!kakaoTags && !exhausted;

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

        <div className="mt-5">
          {viaKakao ? (
            // 이 버튼이 곧 카카오 동의 화면이다 — 중간 지면을 거치지 않는다.
            // 돌아올 곳은 지금 보던 화면. 동의하고 나면 하던 자리로 돌아온다.
            <KakaoTermsConsentButton next={pathname} tags={kakaoTags!} label="카카오로 동의하기" />
          ) : (
            <a
              href={`/signup/consent?next=${encodeURIComponent(pathname)}`}
              className="flex w-full cursor-pointer items-center justify-center rounded-xl bg-fg py-3.5 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90"
            >
              확인하고 동의하기
            </a>
          )}
        </div>

        <p className="mt-3 text-center text-caption leading-relaxed text-faint">
          {viaKakao ? (
            <>
              이미 동의한 항목은 빼고 필요한 것만 보여드려요
              <br />
            </>
          ) : null}
          <a href="/terms" target="_blank" className="underline underline-offset-2 hover:text-muted">
            이용약관
          </a>
          {" · "}
          <a href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-muted">
            개인정보 처리방침
          </a>
        </p>

        {viaKakao && (
          // 카카오가 안 될 때 빠져나갈 길을 **항상** 열어 둔다. 없으면 카카오에서
          // 동의가 안 잡히는 사람은 버튼만 반복해서 누르고, 그게 쿼터를 태운다.
          <p className="mt-4 text-center text-caption text-faint">
            <a
              href={`/signup/consent?next=${encodeURIComponent(pathname)}`}
              className="underline underline-offset-2 hover:text-muted"
            >
              카카오 대신 여기서 동의할게요
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

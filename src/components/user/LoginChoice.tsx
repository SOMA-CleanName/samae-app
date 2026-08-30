"use client";

// 로그인 선택 — 카카오 / 이메일 두 갈래.
//
// 상담 다이얼로그와 문의 마지막 말풍선이 같은 것을 쓴다. 두 자리에서 선택지가 다르면
// "아까는 되던 방법이 여기선 없네" 가 되므로 한 컴포넌트로 묶는다.
//
// 이메일 쪽은 입력칸이 여럿이라 다이얼로그 안에서 받기 어렵다 — 로그인 페이지로 보내되
// 이메일 폼이 펼쳐진 상태로 도착하게 한다(?email=1). 눌러서 갔더니 또 눌러야 하면 안 된다.

import Link from "next/link";
import { KakaoLoginButton } from "./KakaoLoginButton";

export function LoginChoice({ next, context }: { next: string; context: string }) {
  return (
    <div className="flex flex-col gap-2">
      <KakaoLoginButton next={next} context={context} label="카카오로 시작하기" />
      <Link
        href={`/login?email=1&next=${encodeURIComponent(next)}`}
        className="flex w-full items-center justify-center rounded-xl border border-line-strong bg-surface py-4 text-body-sm font-semibold text-fg transition-colors hover:bg-surface-2"
      >
        이메일로 시작하기
      </Link>
    </div>
  );
}

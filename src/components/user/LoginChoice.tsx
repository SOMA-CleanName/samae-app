"use client";

// 로그인 유도 — 카카오 하나만.
//
// 상담 다이얼로그와 문의 마지막 말풍선이 같은 것을 쓴다. 두 자리에서 선택지가 다르면
// "아까는 되던 방법이 여기선 없네" 가 되므로 한 컴포넌트로 묶는다.
//
// 선택지를 늘리면 고르는 일이 하나 더 생긴다. 여기는 로그인하러 온 화면이 아니라
// 하려던 일(상담·문의) 중간에 걸린 자리라, 가장 빠른 길 하나만 둔다.
// 이메일 등 다른 방법이 필요하면 /login 이 있다.

import { KakaoLoginButton } from "./KakaoLoginButton";

export function LoginChoice({ next, context }: { next: string; context: string }) {
  return <KakaoLoginButton next={next} context={context} label="카카오로 로그인하기" />;
}

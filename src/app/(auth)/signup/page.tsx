import type { Metadata } from "next";
import { AuthShell } from "../AuthShell";
import { kakaoTermsTagsParam } from "@/lib/kakao-terms";
import { SignupForm, SignupFooter, SignupHeadline } from "./SignupForm";

// 뒤 사진 벽을 10분마다 새로 뽑는다(로그인과 동일 — 이유는 login/page.tsx).
export const revalidate = 600;

export const metadata: Metadata = {
  title: "회원가입",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    // 표제는 클라이언트가 그린다 — 어디서 왔는지(next)에 따라 첫 줄이 달라진다.
    // 작가 모집 링크(/apply)로 온 사람에게 손님용 카피를 보이면 안 된다.
    <AuthShell header={<SignupHeadline />} footer={<SignupFooter />}>
      {/* 간편가입 약관은 **최초 연결 때만** 받을 수 있다. 여기서 태그를 안 실어 보내면
          카카오는 약관 화면을 띄울 기회가 없고, 모든 회원이 우리 체크박스 폼으로 온다
          (2026-09-16 까지 실제로 그랬다 — 카카오에서 약관 동의한 사람이 0명이었다). */}
      <SignupForm kakaoTermsTags={kakaoTermsTagsParam()} />
    </AuthShell>
  );
}

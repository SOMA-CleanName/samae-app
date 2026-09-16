import type { Metadata } from "next";
import { AuthShell } from "../AuthShell";
import { SignupForm, SignupFooter, SignupHeadline } from "./SignupForm";

// 뒤 사진 벽은 하루 한 번만 새로 뽑는다(로그인과 동일).
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "회원가입",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    // 표제는 클라이언트가 그린다 — 어디서 왔는지(next)에 따라 첫 줄이 달라진다.
    // 작가 모집 링크(/apply)로 온 사람에게 손님용 카피를 보이면 안 된다.
    <AuthShell header={<SignupHeadline />} footer={<SignupFooter />}>
      <SignupForm />
    </AuthShell>
  );
}

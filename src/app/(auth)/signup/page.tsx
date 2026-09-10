import type { Metadata } from "next";
import { AuthShell } from "../AuthShell";
import { SignupForm, SignupFooter } from "./SignupForm";

// 뒤 사진 벽은 하루 한 번만 새로 뽑는다(로그인과 동일).
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "회원가입",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <AuthShell
      title="사진부터 고르고, 작가는 그다음"
      lead="마음에 든 사진을 누르면 그걸 찍은 작가로 이어져요. 담아두고 한 번에 물어볼 수 있어요."
      footer={<SignupFooter />}
    >
      <SignupForm />
    </AuthShell>
  );
}

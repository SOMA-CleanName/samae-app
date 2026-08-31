import type { Metadata } from "next";
import { AuthShell } from "../AuthShell";
import { LoginForm, LoginFooter } from "./LoginForm";

// 뒤 사진 벽은 하루 한 번만 새로 뽑는다. 로그인 화면은 자주 열리는데
// 매번 DB 를 칠 이유가 없고, 사진이 매 방문 바뀔 필요도 없다.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "로그인",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <AuthShell
      title="다시 오셨네요"
      lead="담아둔 사진과 보낸 문의를 이어서 볼 수 있어요."
      footer={<LoginFooter />}
    >
      <LoginForm />
    </AuthShell>
  );
}

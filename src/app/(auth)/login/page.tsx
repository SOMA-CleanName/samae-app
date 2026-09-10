import type { Metadata } from "next";
import { AuthShell } from "../AuthShell";
import { LoginForm, LoginFooter, LoginHeadline } from "./LoginForm";

// 뒤 사진 벽은 하루 한 번만 새로 뽑는다. 로그인 화면은 자주 열리는데
// 매번 DB 를 칠 이유가 없고, 사진이 매 방문 바뀔 필요도 없다.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "로그인",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    // 표제는 클라이언트가 그린다 — 어디서 왔는지(next)에 따라 첫 줄이 달라진다.
    <AuthShell header={<LoginHeadline />} footer={<LoginFooter />}>
      <LoginForm />
    </AuthShell>
  );
}

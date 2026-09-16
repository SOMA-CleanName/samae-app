import type { Metadata } from "next";
import { AuthShell } from "../AuthShell";
import { kakaoTermsTagsParam } from "@/lib/kakao-terms";
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
      {/* 이 버튼으로도 가입이 된다("가입돼 있지 않아도 이 버튼 하나로 시작돼요").
          그래서 가입 화면과 똑같이 약관 태그를 실어 보낸다 — 카카오가 약관을 물어볼
          수 있는 순간은 **최초 연결 때뿐**이라, 여기서 안 보내면 영영 기회가 없다.
          ISR(revalidate 86400) 렌더 시점에 읽히므로 env 를 바꾸면 재배포가 필요하다. */}
      <LoginForm kakaoTermsTags={kakaoTermsTagsParam()} />
    </AuthShell>
  );
}

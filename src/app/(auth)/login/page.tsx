import type { Metadata } from "next";
import { AuthShell } from "../AuthShell";
import { kakaoTermsTagsParam } from "@/lib/kakao-terms";
import { LoginForm, LoginFooter, LoginHeadline } from "./LoginForm";

/*
  뒤 사진 벽을 10분마다 새로 뽑는다.

  ⚠️ 전에는 86400(하루)이었다. 그게 **"사진이 고정으로 박혀 있다"** 의 절반이었다 —
     쿼리가 최신 18장만 집던 것이 나머지 절반(lib/auth-backdrop). 쿼리를 무작위로
     고쳐도 하루치 HTML 이 캐시돼 있으면 **하루 종일 같은 18장**이다.

  0(매 요청)으로 두지 않는 이유: 로그인·가입은 자주 열리는데 그때마다 DB 를 두 번
  (count + range) 치게 되고, 지면이 동적 렌더로 내려가 응답도 느려진다. 배경 사진이
  10분 단위로 바뀌면 "올 때마다 다른 사진" 으로 충분히 읽힌다.
*/
export const revalidate = 600;

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
          ISR 렌더 시점에 읽히므로 env 를 바꾸면 재배포가 필요하다. */}
      <LoginForm kakaoTermsTags={kakaoTermsTagsParam()} />
    </AuthShell>
  );
}

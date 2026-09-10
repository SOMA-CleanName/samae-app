import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import KakaoMemoTest from "./KakaoMemoTest";

// dev 전용 — 카카오 "나에게 보내기" 알림 채널 실험.
// 전제: 카카오 개발자 콘솔에서 [카카오 로그인 > 동의항목 > 접근권한 > 카카오톡 메시지 전송] 활성화.
export default async function KakaoMemoDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const hasToken = !!(await cookies()).get("kakao_pt_dev")?.value;
  return <KakaoMemoTest hasToken={hasToken} />;
}

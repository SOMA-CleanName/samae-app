import { notFound } from "next/navigation";
import { FlowSandbox } from "./FlowSandbox";

// 작가 온보딩 샌드박스 — 실제 화면 그대로, 저장은 localStorage.
//
// **왜 필요한가.** 로컬이 운영 Supabase 를 그대로 쓴다(별도 dev 프로젝트가 없다).
// 그래서 흐름을 한 번 돌 때마다 진짜 행이 쌓이고, 더 나쁜 건 밖으로 나가는 것들이다 —
// 디스코드 신청 알림이 팀 채널에 울리고, Mixpanel 에 이벤트가 박히고(dev 게이트 없음),
// 솔라피가 문자를 쏜다(NOTIFY_SMS_DEV=on). 화면만 보려고 스무 번 돌면 스무 번 다 그런다.
//
// 여기는 네트워크로 나가는 게 하나도 없다. 대신 **화면과 검증은 실제 것을 그대로** 쓴다
// (ApplyIntro · ApplyLeadForm · AgreeGate · parseApplyForm). 복제하면 조용히 어긋나고,
// 어긋난 쪽을 QA 하게 된다.
//
// 프로덕션에서는 404 (NODE_ENV 는 빌드타임 상수라 번들에서도 제거된다).

export const metadata = { robots: { index: false, follow: false } };

export default function DevFlowPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <FlowSandbox />;
}

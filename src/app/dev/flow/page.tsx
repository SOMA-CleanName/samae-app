import { notFound } from "next/navigation";
import { ApplyIntro } from "@/app/(user)/apply/ApplyIntro";
import { AuthShell } from "@/app/(auth)/AuthShell";
import { SignupFooter, SignupHeadline } from "@/app/(auth)/signup/SignupForm";
import { TERMS_VERSION } from "@/lib/policy-version";
import { FlowBar, SandboxAgree, SandboxApply, SandboxConsent, SandboxContact, SandboxDone, SandboxIntroShim, SandboxPendingShim, SandboxSignupForm } from "./FlowSandbox";
import type { FlowStage } from "./store";

// 작가 온보딩 샌드박스 — **실제 지면 그대로, 저장은 localStorage.**
//
// ⚠️ **서버 컴포넌트다.** 처음엔 클라이언트로 만들었는데, 그러면 가입 지면의 AuthShell
//    (사진 벽을 DB 에서 가져오는 async 서버 컴포넌트)을 못 쓴다. 그래서 그 화면을
//    손으로 흉내 냈었고 — 실제와 다른 화면을 QA 하게 됐다. 지금은 단계를 `?stage=` 로
//    받아 서버에서 진짜 지면을 그리고, 상태만 클라이언트 섬이 localStorage 로 다룬다.
//
// 나가는 네트워크 요청이 없다: DB·디스코드·Mixpanel·문자 전부 안 건드린다.
// (AuthShell 의 사진 벽만 예외 — 지면을 그리려면 실제 사진이 필요하다. 읽기뿐이다.)
//
// 프로덕션에서는 404 (NODE_ENV 는 빌드타임 상수라 번들에서도 제거된다).

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

const KAKAO_CHANNEL = process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL ?? "";

export default async function DevFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const stage = (sp.stage ?? "intro") as FlowStage;

  return (
    <>
      <FlowBar stage={stage} />
      <div className="pt-[3.5rem]">
        {stage === "intro" && (
          <SandboxIntroShim>
            <ApplyIntro />
          </SandboxIntroShim>
        )}

        {/* 가입 — 실제 /signup 지면 그대로(AuthShell + 사진 벽 + 헤드라인 + 푸터).
            카카오 버튼 동작만 갈아 끼운다(진짜 인가는 샌드박스가 태울 수 없다). */}
        {stage === "signup" && (
          <AuthShell header={<SignupHeadline />} footer={<SignupFooter />}>
            <SandboxSignupForm />
          </AuthShell>
        )}

        {stage === "consent" && <SandboxConsent termsVersion={TERMS_VERSION} />}
        {stage === "contact" && <SandboxContact />}
        {stage === "form" && <SandboxApply kakaoChannelUrl={KAKAO_CHANNEL} />}
        {stage === "pending" && <SandboxPendingShim />}
        {stage === "agree" && <SandboxAgree />}
        {stage === "done" && <SandboxDone />}
      </div>
    </>
  );
}

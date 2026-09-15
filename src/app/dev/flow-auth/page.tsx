import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthShell } from "@/app/(auth)/AuthShell";
import { SignupFooter, SignupForm, SignupHeadline } from "@/app/(auth)/signup/SignupForm";
import { TERMS_VERSION } from "@/lib/policy-version";
import {
  FlowKeys,
  SandboxAgree,
  SandboxConsent,
  SandboxContact,
} from "../_flow/FlowSandbox";
import type { FlowStage } from "../_flow/store";

// 작가 온보딩 샌드박스 — **레이아웃이 없는(루트만) 단계들.**
//
//   가입·약관·연락처  실제로 `(auth)` 에 있는데 그 그룹엔 layout.tsx 가 없다 → 루트와 동일
//   입점 동의         studio/layout 이 동의 전이면 AgreeGate 만 그린다 → 역시 루트와 동일
//
// `(user)` 레이아웃(하단 내비)이 붙는 안내·신청폼·승인대기는 `/dev/flow` 가 맡는다.
// 한 라우트에 몰면 셋 중 둘이 실제와 다른 껍데기를 쓰게 되므로 갈랐다.

export const dynamic = "force-dynamic";

const TITLES: Partial<Record<FlowStage, string>> = {
  signup: "회원가입",
  consent: "약관 동의",
  contact: "연락처 등록",
  agree: "입점 계약 동의",
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}): Promise<Metadata> {
  const { stage } = await searchParams;
  return {
    title: TITLES[(stage ?? "signup") as FlowStage] ?? "회원가입",
    robots: { index: false, follow: false },
  };
}

export default async function DevFlowAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { stage: raw } = await searchParams;
  const stage = (raw ?? "signup") as FlowStage;

  return (
    <>
      {/* 화면에 아무것도 그리지 않는다 — ] 다음 · [ 이전 · 0 처음 */}
      <FlowKeys stage={stage} />

      {/* 가입 — 실제 /signup 지면 **그대로**. 감싸는 것도 갈아 끼우는 것도 없다.
          카카오 버튼은 진짜 OAuth 로 나가고, 돌아오면 ?next(=/apply)로 간다. */}
      {stage === "signup" && (
        <AuthShell header={<SignupHeadline />} footer={<SignupFooter />}>
          <SignupForm />
        </AuthShell>
      )}
      {stage === "consent" && <SandboxConsent termsVersion={TERMS_VERSION} />}
      {stage === "contact" && <SandboxContact />}
      {stage === "agree" && <SandboxAgree />}
    </>
  );
}

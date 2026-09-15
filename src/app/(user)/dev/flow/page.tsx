import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApplyIntro } from "@/app/(user)/apply/ApplyIntro";
import {
  FlowKeys,
  SandboxApply,
  SandboxDone,
  SandboxIntroShim,
  SandboxPendingShim,
} from "@/app/dev/_flow/FlowSandbox";
import type { FlowStage } from "@/app/dev/_flow/store";

// 작가 온보딩 샌드박스 — **`(user)` 레이아웃에 속하는 단계들.**
//
// 안내·신청폼·승인대기는 실제로 `(user)/apply` 에 있고, 그 레이아웃이 하단 내비와
// `main.pb-28` 을 붙인다. 루트에 두면 그게 빠져서 **실제와 다른 화면을 보게 된다** —
// 실측으로 확인했다(하단 '홈·매거진' 이 없었다). 그래서 이 라우트를 `(user)` 안에 뒀다.
//
// 가입·약관·연락처·입점동의는 레이아웃이 달라서 `/dev/flow-auth` 가 맡는다.
// 단계 이동(] [ 0)은 두 라우트를 넘나든다 — `_flow/store.ts` 의 stagePath 참고.

export const dynamic = "force-dynamic";

const TITLES: Partial<Record<FlowStage, string>> = {
  intro: "작가 신청",
  form: "작가 신청",
  pending: "작가 신청",
  done: "동의 완료",
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}): Promise<Metadata> {
  const { stage } = await searchParams;
  return {
    title: TITLES[(stage ?? "intro") as FlowStage] ?? "작가 신청",
    robots: { index: false, follow: false },
  };
}

const KAKAO_CHANNEL = process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL ?? "";

export default async function DevFlowUserPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { stage: raw } = await searchParams;
  const stage = (raw ?? "intro") as FlowStage;

  return (
    <>
      {/* 화면에 아무것도 그리지 않는다 — ] 다음 · [ 이전 · 0 처음 */}
      <FlowKeys stage={stage} />
      {stage === "intro" && (
        <SandboxIntroShim>
          <ApplyIntro />
        </SandboxIntroShim>
      )}
      {stage === "form" && <SandboxApply kakaoChannelUrl={KAKAO_CHANNEL} />}
      {stage === "pending" && <SandboxPendingShim kakaoChannelUrl={KAKAO_CHANNEL} />}
      {stage === "done" && <SandboxDone />}
    </>
  );
}

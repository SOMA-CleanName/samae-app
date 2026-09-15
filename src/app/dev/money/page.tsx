import type { Metadata } from "next";
import { MoneySandbox } from "@/app/dev/_qa/MoneySandbox";

// §4 QA — 정산 금액 샌드박스. 사업자 유형을 바꿔가며 원천징수가 어떻게 달라지는지 본다.
//
// ⚠️ **못 보는 것**: 스튜디오 좌측 사이드바(studio/layout)와 어드민 상단 껍데기.
//    그 둘은 로그인·권한을 요구하는 서버 레이아웃이라 샌드박스로 끌고 올 수 없다.
//    여기서 확인하는 건 **숫자와 안내 문구**이고, 그 둘은 지면 껍데기와 무관하다.
//    사이드바까지 보려면 실제 계정으로 /studio/settlements 를 열어야 한다.
//
// 프로덕션에서는 proxy.ts 의 blockDevRoutes 가 404 로 막는다.

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DevMoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  return <MoneySandbox type={type === "general" ? "general" : "unregistered"} />;
}

import type { Metadata } from "next";
import { ApplyLeadForm } from "./ApplyLeadForm";

export const metadata: Metadata = { title: "작가 신청 · SAMAE" };

// 작가 신청(공개) — 비로그인도 접근. 정보 입력 + 카카오 채널로 신청.
export default function ApplyPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:px-6 font-kr">
      <h1 className="text-2xl font-semibold">작가 신청</h1>
      <p className="mt-2 text-sm text-fg/60">
        아래 정보를 남기고 SAMAE 카카오 채널로 신청 메시지를 보내주세요. 운영자가 확인 후 안내드려요.
      </p>
      <ApplyLeadForm kakaoChannelUrl={process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL ?? ""} />
    </main>
  );
}

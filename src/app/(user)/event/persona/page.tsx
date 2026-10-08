import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import PersonaExperience from "./PersonaExperience";

export const metadata: Metadata = {
  title: "내 촬영 페르소나 — samae",
  description: "인스타그램 미감을 읽어 나에게 어울리는 촬영 무드와 사진을 찾아드려요.",
};

// 이벤트 전용 몰입형 진입 — 인스타 아이디 → 촬영 페르소나 분석.
// ?u=아이디 로 열면 입력이 미리 채워진다 (광고·DM 딥링크용 — 확인 카드까지 자동으로 뜬다).
export const dynamic = "force-dynamic";

export default async function PersonaEventPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; auto?: string }>;
}) {
  const { u, auto } = await searchParams;
  // 로그인 여부를 서버에서 알고 내려보낸다 — 비로그인에게 "분석 중" 을 보여줬다가
  // 로그인하라고 되돌리면 기다린 시간이 통째로 버려진다.
  const me = await getCurrentUser();
  return (
    <PersonaExperience
      defaultUsername={u ?? ""}
      signedIn={!!me}
      // 로그인하고 돌아온 길이면 그 아이디로 바로 이어서 분석한다
      autoRun={auto === "1" && !!u && !!me}
    />
  );
}

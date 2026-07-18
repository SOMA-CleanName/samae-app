import type { Metadata } from "next";
import PersonaExperience from "./PersonaExperience";

export const metadata: Metadata = {
  title: "내 촬영 페르소나 — samae",
  description: "인스타그램 미감을 읽어 나에게 어울리는 촬영 무드와 사진을 찾아드려요.",
};

// 이벤트 전용 몰입형 진입 — 인스타 아이디 → 촬영 페르소나 분석.
export default function PersonaEventPage() {
  return <PersonaExperience />;
}

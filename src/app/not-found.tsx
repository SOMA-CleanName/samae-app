import type { Metadata } from "next";
import { NotFoundPage } from "@/components/NotFoundPage";

// 어느 경계도 안 잡은 404 의 최종 수신처(존재하지 않는 최상위 경로 등).
// 화면은 (user)/not-found.tsx 와 같은 것을 쓴다 — 어디서 걸리든 같은 안내여야 한다.
export const metadata: Metadata = {
  title: "없는 지면",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return <NotFoundPage />;
}

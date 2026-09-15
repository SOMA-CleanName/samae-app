import type { Metadata } from "next";
import { ChatSandbox } from "@/app/dev/_qa/ChatSandbox";

// 채팅방 결제 플로우 샌드박스 — **여기가 실제 자리다.**
//
// 예약은 채팅 안에서 협의하고 제안하고 수락한다. 결제 팝업은 그 수락의 순간에 뜬다.
// `/dev/pay` 는 그 팝업만 떼어 본 것이고, 이 주소는 방 안에서 순서대로 본다.
//
// `(user)` 레이아웃 안에 산다 — 실제 채팅방도 그 안에 있다(하단 탭바를 -mb-24 로 상쇄한다).
// 프로덕션에서는 proxy.ts 의 blockDevRoutes 가 404 로 막는다.

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DevChatPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;
  // key 로 단계마다 새로 마운트한다 — 앞 단계에서 눌러 둔 상태(연락처 전달·일정 변경)가
  // 남으면 다음 단계를 처음 보는 화면이 아니게 된다
  const s = stage ?? "late";
  return <ChatSandbox key={s} stage={s} />;
}

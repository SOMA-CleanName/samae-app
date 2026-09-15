"use client";

// §4 QA — **채팅방 안에서** 결제 팝업을 본다.
//
// 이게 실제 순서다: 채팅으로 협의 → 작가가 예약서 제안 → **고객이 [수락하기] 를 누르는 순간**
// 결제 안내가 뜬다. 임박 예약이면 그 앞에 위약금 동의가 한 번 더 선다.
// `/dev/pay` 는 그 팝업만 떼어 본 것이고, 여기가 진짜 자리다.
//
// 방은 **실제 ChatRoom 과 ChatShell** 이다. 바꾸는 건 두 가지뿐:
//   · 메시지·예약  → 가짜 (chat-fixtures.ts)
//   · ChatIO       → 아무것도 안 하는 함수들 (DB·실시간·Mixpanel 전부 끊긴다)
//
// ⚠️ 예약서 작성기는 열리지 않는다(`composerData={null}`). 제안은 서버에 쓰는 동작이라
//    샌드박스가 흉내 낼 수 없다 — 그래서 **이미 제안된 상태**로 시작한다.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChatShell } from "@/components/chat/ChatShell";
import { ChatRoom } from "@/app/(user)/chat/[conversationId]/ChatRoom";
import type { ChatIO } from "@/app/(user)/chat/[conversationId]/chat-io";
import { QA_ACCOUNT } from "./fixtures";
import { QA_ME, qaBooking, qaMessages } from "./chat-fixtures";

type StageKey = "late" | "normal" | "revisit" | "paid";

const STAGES: { key: StageKey; label: string }[] = [
  { key: "late", label: "① 임박 예약(3일 뒤) 제안 도착 — 수락하면 동의 모달" },
  { key: "normal", label: "② 여유 예약(20일 뒤) 제안 도착 — 수락하면 바로 계좌" },
  { key: "revisit", label: "③ 수락만 하고 나갔다 돌아온 방 — 자동으로 다시 뜬다" },
  { key: "paid", label: "④ 입금 완료를 누른 뒤 — 카드만 남는다" },
];

/** 아무것도 하지 않는 통로 — 샌드박스는 밖으로 나가지 않는다 */
const SANDBOX_IO: ChatIO = {
  markRead: async () => {},
  sendMessage: async () => ({ ok: true }) as never,
  sendBotTurn: async () => ({ ok: true }) as never,
  sendPortfolioPhoto: async () => {},
  track: () => {},
  acceptBooking: async () => {},
  rejectBooking: async () => {},
  cancelBooking: async () => {},
  agreeLateBooking: async () => {},
  markTransferSent: async () => {},
  submitSupportRequest: async () => {},
  getCustomerRefundQuote: async () => null,
  realtime: false,
};

export function ChatSandbox({ stage }: { stage: string }) {
  const router = useRouter();
  const key: StageKey = (STAGES.find((s) => s.key === stage)?.key ?? "late") as StageKey;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const i = STAGES.findIndex((x) => x.key === key);
      const go = (k: StageKey) => router.push(`/dev/chat?stage=${k}`);
      if (e.key === "]") go(STAGES[Math.min(i + 1, STAGES.length - 1)].key);
      else if (e.key === "[") go(STAGES[Math.max(i - 1, 0)].key);
      else if (e.key === "0") go(STAGES[0].key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, router]);

  const booking = qaBooking(
    key === "late"
      ? { daysUntil: 3, status: "requested" }
      : key === "normal"
        ? { daysUntil: 20, status: "requested" }
        : key === "revisit"
          ? { daysUntil: 3, status: "accepted" }
          : { daysUntil: 3, status: "accepted", transferMarked: true, lateConsented: true }
  );

  return (
    <ChatShell title="김작가" headerHref={null}>
      <ChatRoom
        // 단계를 옮기면 방을 새로 만든다 — 앞 단계의 수락·동의 상태가 남으면 안 된다
        key={key}
        io={SANDBOX_IO}
        conversationId={`qa-${key}`}
        meId={QA_ME}
        amPhotographer={false}
        initialMessages={qaMessages(booking)}
        // 예약서 작성기는 열지 않는다 — 제안은 서버에 쓰는 동작이다
        composerData={null}
        portfolioPhotos={[]}
        brief={null}
        sourcePhotoPath={null}
        customerId={QA_ME}
        counterpartName="김작가"
        payoutAccount={QA_ACCOUNT}
      />
    </ChatShell>
  );
}

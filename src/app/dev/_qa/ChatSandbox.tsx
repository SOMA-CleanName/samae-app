"use client";

// §4 QA — **채팅방 안에서** 결제·연락처·일정 변경을 본다.
//
// 이게 실제 순서다: 채팅으로 협의 → 작가가 예약서 제안 → **고객이 [수락하기] 를 누르는 순간**
// 결제 안내가 뜬다. 입금이 확인된 뒤에는 연락처 전달과 일정 변경이 열린다.
// `/dev/pay` 는 결제 팝업만 떼어 본 것이고, 여기가 진짜 자리다.
//
// 방은 **실제 ChatRoom 과 ChatShell** 이다. 바꾸는 건 두 가지뿐:
//   · 메시지·예약  → 가짜 (chat-fixtures.ts)
//   · ChatIO       → 로컬 state 를 고치는 함수들 (DB·실시간·Mixpanel 전부 끊긴다)
//
// ⚠️ 스텁이 **그냥 no-op 이면 안 된다.** 실제 컴포넌트들은 액션 뒤에 `router.refresh()` 를
//    부르는데, 서버가 같은 고정값을 다시 내려주면 화면이 한 발짝도 안 나간다. 그래서
//    스텁이 예약 스냅샷을 고치고, 그 변화로 방을 다시 그린다 — 실제와 같은 순서로 진행된다.
//
// ⚠️ 예약서 작성기는 열리지 않는다(`composerData={null}`). 제안은 서버에 쓰는 동작이라
//    샌드박스가 흉내 낼 수 없다 — 그래서 **이미 제안된 상태**로 시작한다.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatShell } from "@/components/chat/ChatShell";
import { ChatRoom } from "@/app/(user)/chat/[conversationId]/ChatRoom";
import type { ChatIO } from "@/app/(user)/chat/[conversationId]/chat-io";
import type { BookingSnapshot } from "@/lib/chat";
import { QA_ACCOUNT } from "./fixtures";
import { QA_ME, QA_CONTACTS, qaBooking, qaMessages, type QaStage } from "./chat-fixtures";

const STAGES: { key: QaStage; label: string }[] = [
  { key: "late", label: "① 임박 예약(3일 뒤) 제안 도착 — 수락하면 동의 모달" },
  { key: "normal", label: "② 여유 예약(20일 뒤) 제안 도착 — 수락하면 바로 계좌" },
  { key: "revisit", label: "③ 수락만 하고 나갔다 돌아온 방 — 자동으로 다시 뜬다" },
  { key: "marked", label: "④ 입금 완료를 누른 뒤 — 사매 확인 대기" },
  { key: "paid", label: "⑤ 입금 확인됨 — 연락처 전달 · 일정 변경 (r 로 역할 전환)" },
];

export function ChatSandbox({ stage }: { stage: string }) {
  const router = useRouter();
  const key = (STAGES.find((s) => s.key === stage) ?? STAGES[0]).key;

  /**
   * 역할 전환은 **주소가 아니라 키(`r`)** 로 한다.
   *
   * 연락처 전달은 작가가 보내고 고객이 받는 두 사람의 일이다. 역할을 단계(주소)로 나누면
   * 옮기는 순간 방이 새로 마운트돼 **보낸 사실이 사라지고**, 고객은 받을 카드를 영영 못 본다.
   * 같은 방에서 시점만 바꿔야 "보냈다 → 받는다" 가 이어진다. 일정 변경도 같다.
   */
  const [amPhotographer, setAmPhotographer] = useState(false);

  // 스텁이 고쳐 나가는 예약 상태. 단계를 옮기면 page.tsx 가 key 로 이 컴포넌트를
  // 새로 마운트하므로 여기서 따로 비울 필요가 없다.
  const [patch, setPatch] = useState<Partial<BookingSnapshot>>({});
  // 액션이 만들어 낸 카드들 (연락처·일정 변경). 실제로는 서버가 메시지를 심는다.
  const [cards, setCards] = useState<("contact_card" | "reschedule_card")[]>([]);
  // 방을 다시 그리게 하는 판 번호 — ChatRoom 은 initialMessages 를 자기 state 로 복사하므로
  // key 를 바꿔 새로 마운트해야 바뀐 예약이 반영된다
  const [rev, setRev] = useState(0);

  const booking = useMemo(() => ({ ...qaBooking(key), ...patch }), [key, patch]);
  const messages = useMemo(() => qaMessages(booking, cards), [booking, cards]);

  const bump = (p: Partial<BookingSnapshot>, card?: "contact_card" | "reschedule_card") => {
    setPatch((prev) => ({ ...prev, ...p }));
    if (card) setCards((prev) => (prev.includes(card) ? prev : [...prev, card]));
    setRev((r) => r + 1);
  };

  const io: ChatIO = useMemo(
    () => ({
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

      // 작가가 연락처를 보낸다 → 타임라인에 카드가 서고, 고객 화면에서 받을 수 있게 된다
      sendPhotographerContact: async () => {
        bump({ contact_sent_at: new Date().toISOString(), contact_payload: QA_CONTACTS }, "contact_card");
      },
      // 고객이 고지를 읽고 받는다 → 카드가 실제 연락처를 편다
      acceptPhotographerContact: async () => {
        bump({ contact_delivered_at: new Date().toISOString() });
      },

      // 일정 변경 제안 → 상대가 답할 카드가 선다
      proposeReschedule: async (fd) => {
        const raw = String(fd.get("shootAt") ?? "");
        bump(
          {
            reschedule_proposed_at: raw ? `${raw}:00+09:00` : new Date().toISOString(),
            reschedule_proposed_by: amPhotographer ? "photographer" : "customer",
          },
          "reschedule_card"
        );
      },
      // 동의하면 촬영일이 바뀐다 — 환불 기준도 새 날짜로 다시 계산된다(실제 서버도 그렇다)
      respondReschedule: async (fd) => {
        const accepted = String(fd.get("accept") ?? "") === "1";
        bump({
          shoot_at: accepted ? (patch.reschedule_proposed_at ?? booking.shoot_at) : booking.shoot_at,
          reschedule_proposed_at: null,
          reschedule_proposed_by: null,
        });
      },

      realtime: false,
    }),
    // 최신 patch 를 읽어야 하므로 의존한다 (bump 는 setState 만 쓴다)
    [amPhotographer, patch, booking.shoot_at]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const i = STAGES.findIndex((x) => x.key === key);
      const go = (k: QaStage) => router.push(`/dev/chat?stage=${k}`);
      if (e.key === "]") go(STAGES[Math.min(i + 1, STAGES.length - 1)].key);
      else if (e.key === "[") go(STAGES[Math.max(i - 1, 0)].key);
      else if (e.key === "0") go(STAGES[0].key);
      // r — 같은 방을 상대 시점으로. 눌러 둔 상태는 그대로 남는다
      else if (e.key === "r") setAmPhotographer((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, router]);

  return (
    <ChatShell title={amPhotographer ? "김고객" : "김작가"} headerHref={null}>
      <ChatRoom
        // 판이 바뀌면 방을 새로 만든다 — ChatRoom 은 메시지를 자기 state 로 들고 있다
        key={`${key}-${rev}`}
        io={io}
        conversationId={`qa-${key}`}
        meId={amPhotographer ? "qa-photographer" : QA_ME}
        amPhotographer={amPhotographer}
        initialMessages={messages}
        // 예약서 작성기는 열지 않는다 — 제안은 서버에 쓰는 동작이다
        composerData={null}
        portfolioPhotos={[]}
        brief={null}
        sourcePhotoPath={null}
        customerId={QA_ME}
        counterpartName={amPhotographer ? "김고객" : "김작가"}
        payoutAccount={QA_ACCOUNT}
      />
    </ChatShell>
  );
}

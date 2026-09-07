import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchNotify, notifyLink, photographerNotifyTarget } from "@/lib/notify-dispatch";
import { formatKrwVar, formatShootDateVar, nameVar } from "@/lib/notify-templates";

// 서비스 밖 채널(알림톡·문자) 재소환 — "언제 보낼지" 를 정하는 층.
// "어떻게 보낼지"(채널 선택·중복 억제·큐 기록)는 notify-dispatch.ts 가 맡는다.
//
// 원칙: 앱을 닫아둔 사람이 놓치면 거래가 멈추는 순간에만 보낸다.
// 채팅 한 줄마다 울리면 알림이 소음이 되고, 소음이 되면 정작 입금·정산 알림도 안 읽힌다.

const CHAT_REPLY_COOLDOWN_MS = 4 * 3600_000;

/**
 * 작가 답장 → 고객 재소환. 메시지 insert 성공 직후 호출 (실패해도 채팅 흐름은 계속).
 *
 * 발송 조건:
 *   · 작가가 보낸 메시지로 고객 안읽음이 0→1 이 된 순간에만 (밀린 안읽음에 연타 금지)
 *   · 대화당 쿨다운 4시간 — 작가가 연속으로 여러 줄을 보내도 알림은 1통
 */
export async function notifyUserOfPhotographerReply(
  conversationId: string,
  senderProfileId: string
): Promise<void> {
  try {
    const admin = createAdminClient();

    // 대화·발신자 검증 — 이 대화의 작가가 보낸 게 맞을 때만
    const { data: conv } = await admin
      .from("conversations")
      .select("id, user_id, photographer_id, user_unread")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv) return;
    const { data: photographer } = await admin
      .from("photographers")
      .select("id, profile_id, display_name")
      .eq("id", conv.photographer_id)
      .maybeSingle();
    if (!photographer || photographer.profile_id !== senderProfileId) return; // 사용자 발신이면 무시

    // 안읽음 0→1 순간에만 — 트리거(0004)가 insert 와 같은 트랜잭션에서 +1 하므로
    // 이 시점의 user_unread=1 은 "방금 그 메시지가 첫 안읽음"이라는 뜻
    if ((conv.user_unread as number) !== 1) return;

    await dispatchNotify({
      kind: "chat_reply",
      profileId: conv.user_id,
      dedupeKey: `chat_reply:${conversationId}`,
      cooldownMs: CHAT_REPLY_COOLDOWN_MS,
      variables: {
        작가명: nameVar(photographer.display_name, "작가"),
        링크: notifyLink(`/chat/${conversationId}`),
      },
    });
  } catch (err) {
    console.error("[notify] chat_reply 실패:", err instanceof Error ? err.message : err);
  }
}

/**
 * 새 문의 첫 발화 → 작가 재소환. 봇이 응대 중이어도 작가는 "손님이 왔다" 는 걸 알아야 한다.
 * 대화당 1회 — 인앱 알림(chat-notify.ts)의 첫 발화 규칙과 같은 시점이다.
 */
export async function notifyPhotographerOfNewInquiry(
  conversationId: string,
  photographerId: string
): Promise<void> {
  const target = await photographerNotifyTarget(photographerId);
  if (!target) return;
  await dispatchNotify({
    kind: "inquiry_received",
    profileId: target.profileId,
    dedupeKey: `inquiry_received:${conversationId}`,
    variables: { 링크: notifyLink(`/chat/${conversationId}`) },
  });
}

// ── 예약 ────────────────────────────────────────────────────

type BookingNotifyInfo = {
  bookingId: string;
  /** 받는 사람의 프로필 id */
  recipientProfileId: string | null | undefined;
  /** 알림 문안에 들어갈 '상대' 이름 */
  counterpartName: string;
  shootAt: string | null;
  shootDate?: string | null;
  amountKrw?: number | null;
};

/** 예약 제안 → 상대방. 예약당 1회. */
export async function notifyBookingProposed(info: BookingNotifyInfo): Promise<void> {
  await dispatchNotify({
    kind: "booking_proposed",
    profileId: info.recipientProfileId,
    dedupeKey: `booking_proposed:${info.bookingId}`,
    variables: {
      상대명: nameVar(info.counterpartName, "상대방"),
      촬영일: formatShootDateVar(info.shootAt, info.shootDate),
      금액: formatKrwVar(info.amountKrw),
      링크: notifyLink(`/bookings/${info.bookingId}`),
    },
  });
}

/** 예약 수락 → 제안자. 예약당 1회. */
export async function notifyBookingAccepted(
  info: Omit<BookingNotifyInfo, "amountKrw">
): Promise<void> {
  await dispatchNotify({
    kind: "booking_accepted",
    profileId: info.recipientProfileId,
    dedupeKey: `booking_accepted:${info.bookingId}`,
    variables: {
      상대명: nameVar(info.counterpartName, "상대방"),
      촬영일: formatShootDateVar(info.shootAt, info.shootDate),
      링크: notifyLink(`/bookings/${info.bookingId}`),
    },
  });
}

/** 운영 입금 확인 → 고객. 예약당 1회. */
export async function notifyDepositConfirmed(params: {
  bookingId: string;
  userProfileId: string;
  photographerName: string;
  shootAt: string | null;
  shootDate?: string | null;
}): Promise<void> {
  await dispatchNotify({
    kind: "deposit_confirmed",
    profileId: params.userProfileId,
    dedupeKey: `deposit_confirmed:${params.bookingId}`,
    variables: {
      작가명: nameVar(params.photographerName, "작가"),
      촬영일: formatShootDateVar(params.shootAt, params.shootDate),
      링크: notifyLink(`/bookings/${params.bookingId}`),
    },
  });
}

/** 운영 입금 확인 → 작가. 예약당 1회. */
export async function notifyBookingConfirmedToPhotographer(params: {
  bookingId: string;
  photographerProfileId: string;
  customerName: string;
  shootAt: string | null;
  shootDate?: string | null;
  settlementKrw: number;
}): Promise<void> {
  await dispatchNotify({
    kind: "booking_confirmed",
    profileId: params.photographerProfileId,
    dedupeKey: `booking_confirmed:${params.bookingId}`,
    variables: {
      고객명: nameVar(params.customerName, "고객"),
      촬영일: formatShootDateVar(params.shootAt, params.shootDate),
      정산금액: formatKrwVar(params.settlementKrw),
      링크: notifyLink("/studio/settlements"),
    },
  });
}

/** 정산 완료 → 작가. 예약당 1회. 돈이 실제로 나간 사실은 반드시 밖으로 알린다. */
export async function notifySettlementPaid(params: {
  bookingId: string;
  photographerProfileId: string;
  shootAt: string | null;
  shootDate?: string | null;
  settlementKrw: number;
}): Promise<void> {
  await dispatchNotify({
    kind: "settlement_paid",
    profileId: params.photographerProfileId,
    dedupeKey: `settlement_paid:${params.bookingId}`,
    variables: {
      촬영일: formatShootDateVar(params.shootAt, params.shootDate),
      정산금액: formatKrwVar(params.settlementKrw),
      링크: notifyLink("/studio/settlements"),
    },
  });
}

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchNotify, notifyLink, photographerNotifyTarget } from "@/lib/notify-dispatch";
import { formatKrwVar, formatShootDateVar, nameVar } from "@/lib/notify-templates";
import { decideChatReplyNotification } from "@/lib/notification-policy";

// 서비스 밖 채널(알림톡·문자) 재소환 — "언제 보낼지" 를 정하는 층.
// "어떻게 보낼지"(채널 선택·중복 억제·큐 기록)는 notify-dispatch.ts 가 맡는다.
//
// 원칙: 앱을 닫아둔 사람이 놓치면 거래가 멈추는 순간에만 보낸다.
// 채팅 한 줄마다 울리면 알림이 소음이 되고, 소음이 되면 정작 입금·정산 알림도 안 읽힌다.

/** 채팅 알림의 수신 방향 — 대화당 두 시계가 따로 돈다. */
export type ChatNotifySide = "user" | "photographer";

/** 대화 + 양쪽 프로필/읽음시각을 한 번에 — 발송 판정과 리마인더가 같은 모양을 쓴다. */
export type ChatNotifyContext = {
  conversationId: string;
  userProfileId: string;
  photographerProfileId: string | null;
  photographerName: string | null;
  userName: string | null;
  userReadAt: string | null;
  photographerReadAt: string | null;
};

export function chatDedupeKey(conversationId: string, side: ChatNotifySide): string {
  // ⚠️ side 를 키에 넣어야 두 방향의 쿨다운이 서로를 잡아먹지 않는다.
  //    (예전 키는 `chat_reply:${id}` 였다 — 단방향이라 구분할 이유가 없었다)
  return `chat_reply:${conversationId}:${side}`;
}

export async function loadChatNotifyContext(
  conversationId: string
): Promise<ChatNotifyContext | null> {
  const admin = createAdminClient();
  const { data: conv } = await admin
    .from("conversations")
    .select("id, user_id, photographer_id, user_read_at, photographer_read_at")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return null;

  const [{ data: photographer }, { data: user }] = await Promise.all([
    admin
      .from("photographers")
      .select("profile_id, display_name")
      .eq("id", conv.photographer_id)
      .maybeSingle(),
    admin.from("profiles").select("display_name").eq("id", conv.user_id).maybeSingle(),
  ]);

  return {
    conversationId: conv.id as string,
    userProfileId: conv.user_id as string,
    photographerProfileId: (photographer?.profile_id as string) ?? null,
    photographerName: (photographer?.display_name as string) ?? null,
    userName: (user?.display_name as string) ?? null,
    userReadAt: (conv.user_read_at as string) ?? null,
    photographerReadAt: (conv.photographer_read_at as string) ?? null,
  };
}

/** 이 방향으로 마지막에 실제 발송된 시각. 쿨다운·리마인더 기준. */
export async function lastChatNotifySentAt(
  conversationId: string,
  side: ChatNotifySide
): Promise<Date | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("notification_queue")
    .select("sent_at")
    .eq("dedupe_key", chatDedupeKey(conversationId, side))
    .eq("status", "sent")
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.sent_at ? new Date(data.sent_at as string) : null;
}

/** 한쪽에게 채팅 알림 한 통. 판정은 이미 끝났다고 보고 보내기만 한다. */
export async function sendChatNotify(
  ctx: ChatNotifyContext,
  side: ChatNotifySide
): Promise<void> {
  const toPhotographer = side === "photographer";
  const profileId = toPhotographer ? ctx.photographerProfileId : ctx.userProfileId;
  if (!profileId) return;

  await dispatchNotify({
    // 작가용 템플릿은 아직 검수 전이라 ID 가 없다 → dispatchNotify 가 문자로 폴백한다.
    kind: toPhotographer ? "chat_message_to_photographer" : "chat_reply",
    profileId,
    dedupeKey: chatDedupeKey(ctx.conversationId, side),
    variables: {
      작가명: nameVar(ctx.photographerName, "작가"),
      고객명: nameVar(ctx.userName, "고객"),
      링크: notifyLink(`/chat/${ctx.conversationId}`),
      // 알림톡 버튼 URL(https://samae.ai/chat/#{채팅방ID})용 — 본문에는 안 쓰인다
      채팅방ID: ctx.conversationId,
    },
  });
}

/**
 * 채팅 메시지 → 상대방 재소환. 메시지 insert 성공 직후 호출 (실패해도 채팅 흐름은 계속).
 *
 * **양방향이다.** 작가가 보내면 고객이, 고객이 보내면 작가가 받는다.
 *
 * 다른 알림과 달리 **보낼지 말지를 여기서 먼저 따진다** (판정은 notification-policy.ts):
 *   · 최근 20초 안에 읽은 방이면 보내지 않는다 — 지금 보고 있다는 뜻이다.
 *     방을 열어두면 하트비트가 10초마다 markRead 를 부른다(ChatRoom.tsx).
 *   · 직전 알림 뒤로 읽은 적이 없으면 12시간 동안 다시 보내지 않는다.
 *     상대가 연달아 여러 줄을 보내도 알림은 1통.
 *   · 읽었으면 쿨다운은 풀린다 — 읽고 나간 뒤 온 새 메시지는 다시 알려야 한다.
 *   · 12시간이 지나도 안 읽었으면 `/api/cron/chat-reminder` 가 한 번 더 보낸다.
 *
 * `*_unread` 로는 이 판정을 못 한다. 트리거가 +1 한 직후에 이 함수가 도는데
 * 상대 브라우저의 읽음 처리는 그 뒤에 도착하므로, 여기서는 늘 "안 읽음" 으로 보인다.
 * 그래서 안읽음 수가 아니라 `*_read_at`(0110·0111)을 본다.
 */
export async function notifyChatMessage(
  conversationId: string,
  senderProfileId: string
): Promise<void> {
  try {
    const ctx = await loadChatNotifyContext(conversationId);
    if (!ctx) return;

    // 보낸 사람이 누구냐로 받는 쪽이 갈린다. 둘 다 아니면(봇·운영자) 보내지 않는다.
    let side: ChatNotifySide;
    if (senderProfileId === ctx.photographerProfileId) side = "user";
    else if (senderProfileId === ctx.userProfileId) side = "photographer";
    else return;

    const readAt = side === "user" ? ctx.userReadAt : ctx.photographerReadAt;
    const decision = decideChatReplyNotification({
      lastReadAt: readAt ? new Date(readAt) : null,
      lastSentAt: await lastChatNotifySentAt(conversationId, side),
      now: new Date(),
    });
    if (!decision.send) return;

    // 억제 판정은 위에서 끝냈다 — dispatchNotify 의 쿨다운은 걸지 않는다.
    // (여기 규칙은 "읽으면 리셋" 이라 단순 시간 창으로 표현되지 않는다)
    await sendChatNotify(ctx, side);
  } catch (err) {
    console.error("[notify] chat_message 실패:", err instanceof Error ? err.message : err);
  }
}

/** @deprecated 이름만 남긴 별칭 — 호출부를 정리하면 지운다. */
export const notifyUserOfPhotographerReply = notifyChatMessage;

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
    variables: {
      링크: notifyLink(`/chat/${conversationId}`),
      채팅방ID: conversationId, // 버튼 URL 용
    },
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

/**
 * 예약 제안 → 상대방. 예약당 1회.
 *
 * ⚠️ **방향별로 템플릿이 다르다.** 하나로 묶은 템플릿이 "수신 대상 불명확" 으로 두 번
 *    반려됐다(notify-templates.ts 의 booking_proposed_* 주석). 카카오가 묻는 건
 *    "수신자가 무엇을 해서 이 메시지를 받는가" 인데, 양방향이면 그 답이 안 나온다.
 *
 *    dedupeKey 는 방향과 무관하게 예약 하나당 하나다 — 방향이 바뀔 일은 없고,
 *    키에 방향을 섞으면 같은 예약에 두 통이 나갈 수 있다.
 */
export async function notifyBookingProposed(
  info: BookingNotifyInfo & {
    /** 받는 쪽이 작가인가. 즉 **고객이 제안**했는가 (actions/bookings.ts 의 !amPhotographer) */
    toPhotographer: boolean;
  }
): Promise<void> {
  // 변수 이름도 템플릿마다 다르다 — 수신자를 특정하려고 "상대명" 을 버렸기 때문이다
  const 상대: Record<string, string> = info.toPhotographer
    ? { 고객명: nameVar(info.counterpartName, "고객") }
    : { 작가명: nameVar(info.counterpartName, "작가") };

  await dispatchNotify({
    kind: info.toPhotographer ? "booking_proposed_to_photographer" : "booking_proposed_to_customer",
    profileId: info.recipientProfileId,
    dedupeKey: `booking_proposed:${info.bookingId}`,
    variables: {
      예약ID: info.bookingId, // 버튼 URL 용
      ...상대,
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
      예약ID: info.bookingId, // 버튼 URL 용
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
      예약ID: params.bookingId, // 버튼 URL 용
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
      예약ID: params.bookingId, // 버튼 URL 용
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

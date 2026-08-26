"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import type { PayoutAccount } from "@/lib/payments";
import { getPlatformAccount, hasAccount } from "@/lib/platform-account";
import { archiveAndDelete } from "@/lib/soft-delete";
import { notifyUserOfPhotographerReply } from "@/lib/notify-user";
import { detectOffPlatform, MODERATION_NOTICE } from "@/lib/moderation";
import { coreSlotsFilled, type LlmSlots } from "@/lib/inquiry-bot-llm";
import { finalizeBotInquiryFor } from "@/app/(user)/inquiry/actions";

// 송금 단계(수락 이후)에서만 작가 수취 계좌를 공개 — 채팅 진입만으로 계좌가 응답에 실리지 않게 한다(리드/보안).
//   · 고객 본인 + 해당 예약이 accepted 이상일 때만 반환, 그 외엔 null.
const PAYOUT_VISIBLE_STATUSES = ["accepted", "paid", "shot", "delivered", "completed"];

export async function getBookingPayoutAccount(bookingId: string): Promise<PayoutAccount | null> {
  const me = await getCurrentUser();
  if (!me) return null;
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("photographer_id, user_id, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking || booking.user_id !== me.id) return null; // 고객 본인만
  if (!PAYOUT_VISIBLE_STATUSES.includes(booking.status as string)) return null;
  // 에스크로 — 고객은 작가 계좌가 아니라 **사매(플랫폼) 계좌**로 입금한다.
  // 사매가 입금 확인 후 수수료를 차감해 작가에게 정산 (작가 계좌는 고객에게 비공개).
  const platform = await getPlatformAccount();
  if (!hasAccount(platform)) return null;
  return { bank: platform.bank, number: platform.number, holder: platform.holder };
}

export type SendMessageResult = { ok: true } | { ok: false; blocked: true; reason: string };

// 작가가 개입한 순간 — 봇 수집이 코어 4슬롯까지 끝나 있으면 그 자리에서 자동 접수한다.
// (봇이 커스텀 질문을 이어가던 중이어도, 작가가 이어받았으면 정리는 충분하다.
//  이게 없으면 "체크리스트 4/4인데 요약 카드가 영영 안 뜨는" 상태가 된다)
async function finalizeIfBotCollectionComplete(conversationId: string, senderId: string) {
  try {
    const admin = createAdminClient();
    const { data: conv } = await admin
      .from("conversations")
      .select("user_id, photographer_id, bot_photo_id, bot_slots")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv || conv.user_id === senderId) return; // 작가 발신일 때만
    const slots = (conv.bot_slots ?? null) as LlmSlots | null;
    if (!slots || !coreSlotsFilled(slots)) return;
    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("type", "summary_card");
    if ((count ?? 0) > 0) return; // 이미 접수됨
    await finalizeBotInquiryFor({
      customerId: conv.user_id,
      photographerId: conv.photographer_id,
      photoId: conv.bot_photo_id ?? null,
      slots,
      notifyPhotographerFlag: false, // 본인이 트리거 — 알림 불필요
    });
  } catch (err) {
    console.error("[bot-room] 개입 시 접수 실패:", err instanceof Error ? err.message : err);
  }
}

// 텍스트 메시지 전송 (RLS: 발신자=본인 + 대화 참여자)
// 오프플랫폼(개인 SNS·연락처) 유도 텍스트는 전송을 차단하고 시도를 어드민용으로 기록한다.
export async function sendMessage(conversationId: string, body: string): Promise<SendMessageResult> {
  const text = body.trim();
  if (!text) return { ok: true };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다.");

  const matched = detectOffPlatform(text);
  if (matched.length > 0) {
    // 차단 — 메시지는 저장하지 않고 시도만 기록 (실패해도 차단은 유지)
    try {
      const admin = createAdminClient();
      const { data: conv } = await admin
        .from("conversations")
        .select("user_id")
        .eq("id", conversationId)
        .maybeSingle();
      await admin.from("moderation_events").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        sender_role: conv?.user_id === user.id ? "customer" : "photographer",
        body: text,
        matched,
      });
    } catch (err) {
      console.error("[moderation] 기록 실패:", err instanceof Error ? err.message : err);
    }
    return { ok: false, blocked: true, reason: MODERATION_NOTICE };
  }

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    type: "text",
    body: text,
  });
  if (error) throw new Error(error.message);

  // 작가 발신이면 사용자에게 SMS 재소환 (내부에서 발신자 검증·쿨다운, 실패해도 무시)
  await notifyUserOfPhotographerReply(conversationId, user.id);
  // 작가 개입 + 봇 수집 완료(4/4) 상태면 요약 카드 자동 접수
  await finalizeIfBotCollectionComplete(conversationId, user.id);
  return { ok: true };
}

// 작가 포트폴리오에서 사진 골라 보내기 (C5) — 참여자 검증 후 image 메시지 생성.
// 업로드 없이 기존 공개 포트폴리오 URL을 그대로 사용한다.
export async function sendPortfolioPhoto(conversationId: string, photoId: string) {
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요합니다.");

  const supabase = await createClient();
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, user_id, photographer_id")
    .eq("id", conversationId)
    .maybeSingle();
  const isParticipant =
    conv && (conv.user_id === me.id || me.photographer?.id === conv.photographer_id);
  if (!conv || !isParticipant) throw new Error("권한이 없습니다.");

  // 사진이 이 작가의 공개 포트폴리오인지 확인 (다른 작가 사진 첨부 방지)
  const { data: photo } = await supabase
    .from("photos")
    .select("src_url, thumb_url, photographer_id, visibility")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo || photo.photographer_id !== conv.photographer_id || photo.visibility !== "published") {
    throw new Error("보낼 수 없는 사진이에요.");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("messages").insert({
    conversation_id: conversationId,
    sender_id: me.id,
    type: "image",
    body: "포트폴리오에서 골랐어요",
    image_path: photo.thumb_url ?? photo.src_url,
  });
  if (error) throw new Error(error.message);

  // 작가가 사진으로 답한 경우도 재소환 대상
  await notifyUserOfPhotographerReply(conversationId, me.id);
}

// 진행 중으로 볼 예약 상태(거절/취소/환불 제외) — 이 상태의 예약이 있으면 대화를 지우지 않는다.
const LIVE_BOOKING_STATUSES = ["requested", "accepted", "paid", "shot", "delivered", "completed"];

// 채팅방 나가기 — 대화와 그 안의 메시지·상담 정보를 완전히 삭제(되돌릴 수 없음).
//   · 같은 작가에게 다시 문의하면 새 대화가 만들어져 옛 상담정보가 남지 않는다.
//   · 예약/결제/정산은 conversations에 종속되지 않아 그대로 보존(예약 페이지에서 계속 확인).
//   · 단, 진행 중인 예약이 있으면 맥락 보존을 위해 삭제 대신 내 쪽에서만 숨김.
export async function leaveConversation(formData: FormData) {
  const conversationId = String(formData.get("conversationId"));
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/chat");

  const supabase = await createClient();
  const { data: conv } = await supabase
    .from("conversations")
    .select("user_id, photographer_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return;

  const isUser = conv.user_id === me.id;
  const isPhotographer = me.photographer?.id === conv.photographer_id;
  if (!isUser && !isPhotographer) return;

  // 진행 중인 예약이 있으면 대화를 지우지 않고 내 쪽에서만 숨김(예약 맥락 보존)
  const { data: liveBooking } = await supabase
    .from("bookings")
    .select("id")
    .eq("user_id", conv.user_id)
    .eq("photographer_id", conv.photographer_id)
    .in("status", LIVE_BOOKING_STATUSES)
    .limit(1)
    .maybeSingle();

  if (liveBooking) {
    const now = new Date().toISOString();
    const patch = isUser
      ? { user_hidden_at: now, user_unread: 0 }
      : { photographer_hidden_at: now, photographer_unread: 0 };
    await supabase.from("conversations").update(patch).eq("id", conversationId);
    revalidatePath("/chat");
    return;
  }

  // 진행 중 예약 없음 → 소프트딜리트(아카이브 후 제거). 메시지·상담정보도 함께 아카이브해 복구 가능.
  await archiveAndDelete("messages", { col: "conversation_id", op: "eq", val: conversationId }, me.id);
  await archiveAndDelete("consultation_briefs", { col: "conversation_id", op: "eq", val: conversationId }, me.id);
  await archiveAndDelete("conversations", { col: "id", op: "eq", val: conversationId }, me.id);
  revalidatePath("/chat");
}

// 대화 진입 시 내 안읽음 0으로
export async function markRead(conversationId: string) {
  const me = await getCurrentUser();
  if (!me) return;
  const supabase = await createClient();
  const { data: conv } = await supabase
    .from("conversations")
    .select("user_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return;

  const patch =
    conv.user_id === me.id ? { user_unread: 0 } : { photographer_unread: 0 };
  await supabase.from("conversations").update(patch).eq("id", conversationId);
  revalidatePath("/chat");
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateConversation } from "@/lib/conversations";
import { getPhotographerPayoutAccount, type PayoutAccount } from "@/lib/payments";
import { archiveAndDelete } from "@/lib/soft-delete";

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
  return getPhotographerPayoutAccount(booking.photographer_id as string);
}

// 작가에게 채팅 시작 — 기존 진입점 호환용. 신규 CTA는 문의 폼을 먼저 거친다.
export async function startConversation(formData: FormData) {
  const photographerId = String(formData.get("photographerId"));
  const photoId = String(formData.get("photoId") || "");
  const conversationId = await getOrCreateConversation(photographerId, photoId);
  redirect(`/chat/${conversationId}`);
}

// 텍스트 메시지 전송 (RLS: 발신자=본인 + 대화 참여자)
export async function sendMessage(conversationId: string, body: string) {
  const text = body.trim();
  if (!text) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다.");

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    type: "text",
    body: text,
  });
  if (error) throw new Error(error.message);
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

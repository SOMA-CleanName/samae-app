"use server";

// 결과물 전달 기한 연장 — 작가가 제안하고 고객이 동의한다 (회원약관 10조 5항, 작가약관 10조 2항).
// 기한을 14일 이상 넘기면 고객이 전액 환불을 요구할 수 있다 (작가약관 10조 3항, 취소환불정책 10조 2항).
//
// 연락처 전달과 같은 모양이다: 작가의 제안은 예약 컬럼(delivery_extension_proposed_to)에 두고,
// 타임라인에는 extension_card 말풍선을 남긴다. 고객이 동의하면 delivery_due_at 을 새 기한으로
// 바꾸고 제안을 비운다. 거절해도 제안만 비운다. 카드는 예약 컬럼을 보고 상태를 그린다.

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidExtension } from "@/lib/delivery-deadline";

const dayFmt = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" });

/** 작가: 새 기한을 제안한다. 입금 확인 후 ~ 전달 전까지 */
export async function proposeDeliveryExtension(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 요청할 수 있어요.");
  const bookingId = String(formData.get("id"));
  const dateRaw = String(formData.get("date") || ""); // YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) throw new Error("새 기한 날짜를 골라주세요.");
  const proposed = new Date(`${dateRaw}T23:59:59+09:00`);

  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("id, status, photographer_id, user_id, delivery_due_at, delivered_at, delivery_extension_proposed_to")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) throw new Error("예약을 찾을 수 없습니다.");
  if (b.photographer_id !== me.photographer.id) throw new Error("이 예약의 작가가 아니에요.");
  if (!["paid", "shot"].includes(b.status as string) || b.delivered_at)
    throw new Error("입금 확인 후, 결과물을 전달하기 전에만 요청할 수 있어요.");
  if (b.delivery_extension_proposed_to) throw new Error("고객이 아직 답하지 않은 요청이 있어요.");
  if (!isValidExtension(b.delivery_due_at, proposed))
    throw new Error("기존 기한보다 뒤여야 하고, 오늘부터 90일 안이어야 해요.");

  await admin
    .from("bookings")
    .update({ delivery_extension_proposed_to: proposed.toISOString() })
    .eq("id", bookingId);

  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (conv) {
    // 발신자를 작가로 두면 트리거가 고객 안읽음을 올린다 — 고객이 답해야 하는 카드다
    await admin.from("messages").insert({
      conversation_id: conv.id,
      sender_id: me.id,
      type: "extension_card",
      body: `결과물 전달 기한을 ${dayFmt.format(proposed)}까지로 연장 요청`,
      booking_id: bookingId,
    });
    revalidatePath(`/chat/${conv.id}`);
  }
  await admin.from("notifications").insert({
    recipient_id: b.user_id,
    type: "booking",
    title: "결과물 전달 기한 연장 요청",
    body: `작가님이 전달 기한을 ${dayFmt.format(proposed)}까지로 늦추고 싶어 해요. 채팅에서 답해주세요.`,
    link: `/bookings/${bookingId}`,
  });
  revalidatePath(`/bookings/${bookingId}`);
}

/** 고객: 동의 또는 거절 */
export async function respondDeliveryExtension(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요합니다.");
  const bookingId = String(formData.get("id"));
  const accept = String(formData.get("accept")) === "1";

  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("id, user_id, photographer_id, delivery_extension_proposed_to, delivery_due_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) throw new Error("예약을 찾을 수 없습니다.");
  if (b.user_id !== me.id) throw new Error("이 예약의 고객만 답할 수 있어요.");
  const proposed = b.delivery_extension_proposed_to as string | null;
  if (!proposed) return; // 이미 처리됨 — 멱등

  await admin
    .from("bookings")
    .update({
      delivery_extension_proposed_to: null,
      ...(accept ? { delivery_due_at: proposed } : {}),
    })
    .eq("id", bookingId)
    .eq("delivery_extension_proposed_to", proposed); // 읽은 뒤 바뀌었으면 적용하지 않는다

  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (conv) {
    await admin.from("messages").insert({
      conversation_id: conv.id,
      sender_id: me.id,
      type: "system",
      body: accept
        ? `📅 결과물 전달 기한이 ${dayFmt.format(new Date(proposed))}까지로 연장됐어요.`
        : "고객이 전달 기한 연장에 동의하지 않았어요. 기존 기한이 유지돼요.",
    });
    revalidatePath(`/chat/${conv.id}`);
  }
  const { data: ph } = await admin
    .from("photographers")
    .select("profile_id")
    .eq("id", b.photographer_id)
    .maybeSingle();
  if (ph)
    await admin.from("notifications").insert({
      recipient_id: ph.profile_id,
      type: "booking",
      title: accept ? "전달 기한이 연장됐어요" : "전달 기한 연장이 거절됐어요",
      body: accept
        ? `${dayFmt.format(new Date(proposed))}까지 전달해주세요.`
        : "기존 기한이 그대로예요. 기한 안에 전달해주세요.",
      link: `/bookings/${bookingId}`,
    });
  revalidatePath(`/bookings/${bookingId}`);
}

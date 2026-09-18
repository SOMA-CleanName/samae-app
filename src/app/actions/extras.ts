"use server";

// 추가 결제 — 회원약관 8조, 작가약관 7조 5항. 취소·환불은 취소환불정책 11조.
//
// 작가가 항목·금액을 적어 요청 → 고객이 수락/거절 → 수락하면 사매 계좌로 입금하고 [입금 완료]
// → 어드민이 확인(admin/transactions) → 결제 완료. 촬영 후 결과물 추가금은 작가가 [전달 완료]를 눌러 닫는다.
// 카드는 extra_card 말풍선(body=JSON)이고 상태는 booking_extras 행이 진실이다.

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectOffPlatform, MODERATION_NOTICE } from "@/lib/moderation";
import { notifyOpsBookingDeposit } from "@/lib/ops-alert";
import type { ExtraCardBody, ExtraKind } from "@/lib/extras";

const fmt = new Intl.NumberFormat("ko-KR");

async function convOf(admin: ReturnType<typeof createAdminClient>, bookingId: string) {
  const { data } = await admin.from("conversations").select("id, user_id").eq("booking_id", bookingId).maybeSingle();
  return data;
}

/** 작가: 추가 결제를 요청한다. 입금 확인 후(paid/shot/completed) */
export async function requestExtra(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 요청할 수 있어요.");
  const bookingId = String(formData.get("id"));
  const title = String(formData.get("title") || "").trim().slice(0, 60);
  const amount = Number(String(formData.get("amountKrw") || "").replace(/[^0-9]/g, ""));
  if (!title) throw new Error("추가 작업 항목을 적어주세요.");
  if (!Number.isFinite(amount) || amount < 1000 || amount > 10_000_000) throw new Error("금액은 1,000원 이상 1,000만원 이하여야 해요.");
  if (detectOffPlatform(title).length > 0) throw new Error(MODERATION_NOTICE);

  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("id, status, user_id, photographer_id, shoot_at, refunded_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) throw new Error("예약을 찾을 수 없습니다.");
  if (b.photographer_id !== me.photographer.id) throw new Error("이 예약의 작가가 아니에요.");
  if (!["paid", "shot", "completed"].includes(b.status as string) || b.refunded_at)
    throw new Error("입금이 확인된 예약에서만 요청할 수 있어요.");

  // 촬영 전이면 원 예약에 합산되는 추가금, 촬영이 지났으면 결과물 추가금 (회원약관 8조 3항)
  const shootPassed = !!b.shoot_at && new Date(b.shoot_at).getTime() < Date.now();
  const kind: ExtraKind = b.status === "paid" && !shootPassed ? "pre_shoot" : "post_shoot";

  const { data: extra, error } = await admin
    .from("booking_extras")
    .insert({ booking_id: bookingId, title, amount_krw: amount, kind, requested_by: me.id })
    .select("id")
    .single();
  if (error || !extra) throw new Error("요청을 저장하지 못했어요.");

  const conv = await convOf(admin, bookingId);
  if (conv) {
    const body: ExtraCardBody = { extraId: extra.id, title, amountKrw: amount, kind };
    // 발신자를 작가로 두면 트리거가 고객 안읽음을 올린다 — 고객이 답해야 하는 카드다
    await admin.from("messages").insert({
      conversation_id: conv.id,
      sender_id: me.id,
      type: "extra_card",
      body: JSON.stringify(body),
      booking_id: bookingId,
    });
    revalidatePath(`/chat/${conv.id}`);
  }
  await admin.from("notifications").insert({
    recipient_id: b.user_id,
    type: "payment",
    title: "추가 결제 요청",
    body: `${title} ₩${fmt.format(amount)} — 채팅에서 수락하거나 거절해주세요.`,
    link: `/bookings/${bookingId}`,
  });
  revalidatePath(`/bookings/${bookingId}`);
}

async function loadExtraForParty(extraId: string, meId: string, photographerId: string | null) {
  const admin = createAdminClient();
  const { data: e } = await admin
    .from("booking_extras")
    .select("id, booking_id, title, amount_krw, kind, status, transfer_marked_at, paid_at, delivered_at")
    .eq("id", extraId)
    .maybeSingle();
  if (!e) throw new Error("요청을 찾을 수 없습니다.");
  const { data: b } = await admin
    .from("bookings")
    .select("id, user_id, photographer_id, status")
    .eq("id", e.booking_id)
    .maybeSingle();
  if (!b) throw new Error("예약을 찾을 수 없습니다.");
  return {
    admin,
    e,
    b,
    amCustomer: b.user_id === meId,
    amPhotographer: !!photographerId && photographerId === b.photographer_id,
  };
}

/** 고객: 수락 또는 거절 */
export async function respondExtra(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요합니다.");
  const extraId = String(formData.get("id"));
  const accept = String(formData.get("accept")) === "1";
  const { admin, e, b, amCustomer } = await loadExtraForParty(extraId, me.id, me.photographer?.id ?? null);
  if (!amCustomer) throw new Error("이 예약의 고객만 답할 수 있어요.");
  if (e.status !== "requested") return; // 멱등

  await admin
    .from("booking_extras")
    .update({ status: accept ? "accepted" : "declined" })
    .eq("id", extraId)
    .eq("status", "requested");

  const conv = await convOf(admin, b.id);
  if (conv) {
    await admin.from("messages").insert({
      conversation_id: conv.id,
      sender_id: me.id,
      type: "system",
      body: accept
        ? `추가 결제 "${e.title}" ₩${fmt.format(e.amount_krw)}을 수락했어요. 사매 계좌로 입금하고 [입금 완료]를 눌러주세요.`
        : `추가 결제 "${e.title}" 요청을 거절했어요. 원래 예약은 그대로예요.`,
    });
    revalidatePath(`/chat/${conv.id}`);
  }
  const { data: ph } = await admin.from("photographers").select("profile_id").eq("id", b.photographer_id).maybeSingle();
  if (ph)
    await admin.from("notifications").insert({
      recipient_id: ph.profile_id,
      type: "payment",
      title: accept ? "추가 결제가 수락됐어요" : "추가 결제가 거절됐어요",
      body: accept ? `${e.title} — 고객 입금 후 사매가 확인하면 알려드려요.` : `${e.title} — 원래 예약은 그대로예요.`,
      link: `/bookings/${b.id}`,
    });
  revalidatePath(`/bookings/${b.id}`);
}

/** 고객: 사매 계좌로 입금했다고 알린다 */
export async function markExtraTransfer(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요합니다.");
  const extraId = String(formData.get("id"));
  const { admin, e, b, amCustomer } = await loadExtraForParty(extraId, me.id, me.photographer?.id ?? null);
  if (!amCustomer) throw new Error("이 예약의 고객만 알릴 수 있어요.");
  if (e.status !== "accepted" || e.transfer_marked_at) return;

  await admin
    .from("booking_extras")
    .update({ transfer_marked_at: new Date().toISOString() })
    .eq("id", extraId)
    .is("transfer_marked_at", null);

  const conv = await convOf(admin, b.id);
  if (conv) {
    await admin.from("messages").insert({
      conversation_id: conv.id,
      sender_id: me.id,
      type: "system",
      body: `✅ 추가 결제 "${e.title}" ₩${fmt.format(e.amount_krw)} 입금 완료를 알렸어요. 사매가 확인하면 반영돼요.`,
    });
    revalidatePath(`/chat/${conv.id}`);
  }
  // 운영 디스코드 — 예약 입금 신고와 같은 채널. 금액이 다르니 본문에서 추가금임을 알 수 있게 예약 링크로 간다
  await notifyOpsBookingDeposit({ bookingId: b.id });
  revalidatePath(`/bookings/${b.id}`);
}

/** 작가: 촬영 후 추가 작업의 결과물을 전달했다 — 이후 환불 없음 (회원약관 8조 3항) */
export async function markExtraDelivered(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 처리할 수 있어요.");
  const extraId = String(formData.get("id"));
  const { admin, e, b, amPhotographer } = await loadExtraForParty(extraId, me.id, me.photographer.id);
  if (!amPhotographer) throw new Error("이 예약의 작가가 아니에요.");
  if (e.kind !== "post_shoot" || e.status !== "paid" || e.delivered_at) return;

  await admin
    .from("booking_extras")
    .update({ delivered_at: new Date().toISOString() })
    .eq("id", extraId)
    .is("delivered_at", null);

  const conv = await convOf(admin, b.id);
  if (conv) {
    await admin.from("messages").insert({
      conversation_id: conv.id,
      sender_id: me.id,
      type: "system",
      body: `📸 추가 작업 "${e.title}" 결과물이 전달됐어요.`,
    });
    revalidatePath(`/chat/${conv.id}`);
  }
  await admin.from("notifications").insert({
    recipient_id: b.user_id,
    type: "booking",
    title: "추가 작업 결과물이 전달됐어요",
    body: `${e.title} — 확인해주세요.`,
    link: `/bookings/${b.id}`,
  });
  revalidatePath(`/bookings/${b.id}`);
}

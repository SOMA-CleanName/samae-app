"use server";

// 일정 변경 — 취소환불정책 7조.
//
// 어느 쪽이든 새 일시를 제안하고, 상대가 동의하면 바뀐다. 남은 기간 조건은 없다(7조 1항).
// 동의하면 바뀐 날짜부터 규정을 다시 세므로(7조 3항) 위약금 예고 알림 표시와 전달 기한을 함께 다시 계산한다.
// 작가가 거절하면 고객은 원래 일정에 촬영하거나 취소 신청으로 고객 사정 취소를 한다(7조 4항) — 카드가 그렇게 안내한다.
//
// 입금 후 날짜 변경은 이 경로뿐이다. updateBooking 은 paid 단계에서 날짜를 바꾸지 못하게 막는다.

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeDeliveryDueAt, deliveryDaysOf } from "@/lib/delivery-deadline";

const whenFmt = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

function kstDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** 고객 또는 작가: 새 촬영 일시를 제안한다. 입금 확인 후, 촬영 전까지 */
export async function proposeReschedule(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요합니다.");
  const bookingId = String(formData.get("id"));
  // datetime-local 값(YYYY-MM-DDTHH:mm)을 KST 로 읽는다
  const raw = String(formData.get("shootAt") || "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) throw new Error("새 촬영 일시를 골라주세요.");
  const proposed = new Date(`${raw}:00+09:00`);
  if (isNaN(proposed.getTime())) throw new Error("새 촬영 일시가 올바르지 않아요.");
  if (proposed.getTime() < Date.now() + 60 * 60 * 1000) throw new Error("지금부터 최소 1시간 뒤여야 해요.");

  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("id, status, user_id, photographer_id, shoot_at, shoot_date, reschedule_proposed_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) throw new Error("예약을 찾을 수 없습니다.");
  const amCustomer = b.user_id === me.id;
  const amPhotographer = !!me.photographer && me.photographer.id === b.photographer_id;
  if (!amCustomer && !amPhotographer) throw new Error("이 예약의 당사자만 요청할 수 있어요.");
  if (b.status !== "paid") throw new Error("입금이 확인된 뒤, 촬영 전에만 일정을 바꿀 수 있어요.");
  if (b.reschedule_proposed_at) throw new Error("상대가 아직 답하지 않은 요청이 있어요.");
  if (b.shoot_at && new Date(b.shoot_at).getTime() < Date.now()) throw new Error("촬영 시각이 이미 지났어요.");
  if (b.shoot_at && new Date(b.shoot_at).getTime() === proposed.getTime()) throw new Error("지금 일정과 같아요.");

  const by = amCustomer ? "customer" : "photographer";
  const now = new Date().toISOString();
  await admin
    .from("bookings")
    .update({
      reschedule_proposed_at: proposed.toISOString(),
      reschedule_proposed_date: kstDate(proposed.toISOString()),
      reschedule_proposed_by: by,
      reschedule_proposed_on: now,
    })
    .eq("id", bookingId)
    .is("reschedule_proposed_at", null);

  const { data: conv } = await admin.from("conversations").select("id").eq("booking_id", bookingId).maybeSingle();
  if (conv) {
    // 발신자를 제안한 쪽으로 두면 트리거가 상대의 안읽음을 올린다 — 상대가 답해야 하는 카드다
    await admin.from("messages").insert({
      conversation_id: conv.id,
      sender_id: me.id,
      type: "reschedule_card",
      body: `촬영 일정을 ${whenFmt.format(proposed)}(으)로 변경 요청`,
      booking_id: bookingId,
    });
    revalidatePath(`/chat/${conv.id}`);
  }

  const counterpart = amCustomer
    ? (await admin.from("photographers").select("profile_id").eq("id", b.photographer_id).maybeSingle()).data?.profile_id
    : b.user_id;
  if (counterpart)
    await admin.from("notifications").insert({
      recipient_id: counterpart,
      type: "booking",
      title: "촬영 일정 변경 요청",
      body: `${whenFmt.format(proposed)}(으)로 옮기자는 요청이 왔어요. 채팅에서 답해주세요.`,
      link: `/bookings/${bookingId}`,
    });
  revalidatePath(`/bookings/${bookingId}`);
}

/** 상대: 동의 또는 거절 */
export async function respondReschedule(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요합니다.");
  const bookingId = String(formData.get("id"));
  const accept = String(formData.get("accept")) === "1";

  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select(
      "id, status, user_id, photographer_id, shoot_at, package_snapshot, reschedule_proposed_at, reschedule_proposed_date, reschedule_proposed_by"
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) throw new Error("예약을 찾을 수 없습니다.");
  const proposed = b.reschedule_proposed_at as string | null;
  if (!proposed) return; // 이미 처리됨 — 멱등
  const amCustomer = b.user_id === me.id;
  const amPhotographer = !!me.photographer && me.photographer.id === b.photographer_id;
  // 제안한 쪽이 아니라 상대만 답한다
  const responderIs = b.reschedule_proposed_by === "customer" ? "photographer" : "customer";
  if (responderIs === "customer" && !amCustomer) throw new Error("이 예약의 고객만 답할 수 있어요.");
  if (responderIs === "photographer" && !amPhotographer) throw new Error("이 예약의 작가만 답할 수 있어요.");

  const clear = {
    reschedule_proposed_at: null,
    reschedule_proposed_date: null,
    reschedule_proposed_by: null,
    reschedule_proposed_on: null,
  };

  if (accept) {
    // 바뀐 날짜부터 규정을 다시 센다(7조 3항): 위약금 예고 표시와 전달 기한을 새 날짜로
    const due = computeDeliveryDueAt(proposed, b.reschedule_proposed_date, deliveryDaysOf(b.package_snapshot));
    await admin
      .from("bookings")
      .update({
        ...clear,
        shoot_at: proposed,
        shoot_date: b.reschedule_proposed_date,
        notice_penalty_at: null,
        notice_penalty_90_at: null,
        notice_delivery_overdue_at: null,
        delivery_due_at: due ? due.toISOString() : null,
      })
      .eq("id", bookingId)
      .eq("reschedule_proposed_at", proposed);
  } else {
    await admin.from("bookings").update(clear).eq("id", bookingId).eq("reschedule_proposed_at", proposed);
  }

  const when = whenFmt.format(new Date(proposed));
  const { data: conv } = await admin.from("conversations").select("id").eq("booking_id", bookingId).maybeSingle();
  if (conv) {
    let body: string;
    if (accept) {
      body = `📅 촬영 일정이 ${when}(으)로 바뀌었어요. 환불 기준도 바뀐 날짜로 다시 계산돼요.`;
    } else if (responderIs === "photographer") {
      // 작가가 거절 — 고객은 원래 일정에 찍거나, 취소하면 고객 사정 취소다 (7조 4항)
      body =
        "작가님이 일정 변경에 동의하지 않았어요. 원래 일정대로 촬영하거나, 취소를 원하시면 예약 카드의 [사매에 문의] → 취소 신청으로 진행해주세요. 이 경우 고객 사정 취소로 위약금 규정이 적용돼요.";
    } else {
      body = "고객이 일정 변경에 동의하지 않았어요. 원래 일정이 그대로예요.";
    }
    await admin.from("messages").insert({ conversation_id: conv.id, sender_id: me.id, type: "system", body });
    revalidatePath(`/chat/${conv.id}`);
  }

  const proposerId =
    b.reschedule_proposed_by === "customer"
      ? b.user_id
      : (await admin.from("photographers").select("profile_id").eq("id", b.photographer_id).maybeSingle()).data?.profile_id;
  if (proposerId)
    await admin.from("notifications").insert({
      recipient_id: proposerId,
      type: "booking",
      title: accept ? "촬영 일정이 바뀌었어요" : "일정 변경이 거절됐어요",
      body: accept ? `${when}에 만나요.` : "원래 일정이 그대로예요.",
      link: `/bookings/${bookingId}`,
    });
  revalidatePath(`/bookings/${bookingId}`);
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import {
  applyPaymentPaid,
  ensurePendingPayment,
  scheduleSettlementOnComplete,
} from "@/lib/payments";
import type { PgWebhookEvent } from "@/lib/pg-mock";

// 알림 헬퍼 (service_role)
async function notify(
  admin: ReturnType<typeof createAdminClient>,
  recipientId: string,
  title: string,
  body: string,
  link: string,
  type: "booking" | "payment" | "settlement" = "booking"
) {
  await admin.from("notifications").insert({ recipient_id: recipientId, type, title, body, link });
}

function revalidateBooking(id: string) {
  revalidatePath(`/bookings/${id}`);
  revalidatePath("/bookings");
}

// ── Mock 결제 승인 (구매자) ─────────────────────────────────────────
// 실 PG: SDK가 결제창을 열고 PG가 webhook을 호출. Mock: 본 액션이 PG 역할로
// 즉시 결제 성공 이벤트를 만들어 webhook 코어(applyPaymentPaid)에 전달.
export async function mockPayConfirm(formData: FormData) {
  const bookingId = String(formData.get("bookingId"));
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=/bookings/${bookingId}/pay`);

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, user_id, status, amount_krw")
    .eq("id", bookingId)
    .single();
  if (!booking || booking.user_id !== me.id) throw new Error("권한이 없습니다.");
  if (booking.status !== "accepted") redirect(`/bookings/${bookingId}`);

  // prepare(서버 보관 금액) 보장 후 결제 성공 이벤트 구성
  const pending = await ensurePendingPayment(bookingId, booking.amount_krw ?? 0);
  const event: PgWebhookEvent = {
    pg_tx_id: pending.pg_tx_id,
    booking_id: bookingId,
    amount_krw: pending.amount_krw,
    status: "paid",
    paid_at: new Date().toISOString(),
  };
  const result = await applyPaymentPaid(event);
  if (!result.ok) throw new Error(`결제 처리 실패: ${result.reason}`);

  revalidateBooking(bookingId);
  redirect(`/bookings/${bookingId}`);
}

// ── 촬영 완료 표시 (작가) : paid → shot ─────────────────────────────
export async function markShot(formData: FormData) {
  const id = String(formData.get("id"));
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 가능합니다.");

  const admin = createAdminClient();
  const { data: moved } = await admin
    .from("bookings")
    .update({ status: "shot", shot_at: new Date().toISOString() })
    .eq("id", id)
    .eq("photographer_id", me.photographer.id)
    .eq("status", "paid")
    .select("id, user_id");
  if (!moved || moved.length === 0) throw new Error("처리할 수 없는 상태입니다.");

  await notify(admin, moved[0].user_id, "촬영이 완료됐어요", "보정본 전달을 기다려주세요.", `/bookings/${id}`);
  revalidateBooking(id);
}

// ── 보정본 전달 표시 (작가) : shot → delivered ──────────────────────
// 6단계에서 실제 보정본 업로드(deliveries)와 만료 다운로드 링크를 연결한다.
// 여기서는 머니패스 검증을 위한 최소 전이만 수행.
export async function markDelivered(formData: FormData) {
  const id = String(formData.get("id"));
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 가능합니다.");

  const admin = createAdminClient();
  const { data: moved } = await admin
    .from("bookings")
    .update({ status: "delivered", delivered_at: new Date().toISOString() })
    .eq("id", id)
    .eq("photographer_id", me.photographer.id)
    .eq("status", "shot")
    .select("id, user_id");
  if (!moved || moved.length === 0) throw new Error("처리할 수 없는 상태입니다.");

  await notify(admin, moved[0].user_id, "보정본이 전달됐어요", "확인 후 거래를 완료해주세요.", `/bookings/${id}`);
  revalidateBooking(id);
}

// ── 전달 확인 (구매자) : delivered → completed + 정산 예약 ─────────────
export async function confirmCompletion(formData: FormData) {
  const id = String(formData.get("id"));
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요합니다.");

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: moved } = await admin
    .from("bookings")
    .update({ status: "completed", completed_at: now })
    .eq("id", id)
    .eq("user_id", me.id)
    .eq("status", "delivered")
    .select("id, photographer_id");
  if (!moved || moved.length === 0) throw new Error("처리할 수 없는 상태입니다.");

  // 정산 보류 → 예정 (docs/05: completed 시 정산 확정)
  await scheduleSettlementOnComplete(admin, id, now);

  const { data: ph } = await admin
    .from("photographers")
    .select("profile_id")
    .eq("id", moved[0].photographer_id)
    .single();
  if (ph) await notify(admin, ph.profile_id, "거래가 완료됐어요", "정산이 예정되었습니다.", `/bookings/${id}`, "settlement");
  revalidateBooking(id);
}

// ── 환불 (운영자, 또는 결제 후 구매자 요청) ───────────────────────────
// paid/shot/delivered 구간 환불. 정산 보류(held), 슬롯 해제.
export async function refundBooking(formData: FormData) {
  const id = String(formData.get("id"));
  const partial = Number(formData.get("amount") || 0); // 0 이면 전액
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요합니다.");

  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("id, status, user_id, photographer_id, availability_id")
    .eq("id", id)
    .single();
  if (!b) throw new Error("예약을 찾을 수 없습니다.");

  const isBuyer = b.user_id === me.id;
  if (!isBuyer && me.role !== "admin") throw new Error("권한이 없습니다.");
  if (!["paid", "shot", "delivered"].includes(b.status)) throw new Error("환불할 수 없는 상태입니다.");

  const { data: payment } = await admin
    .from("payments")
    .select("id, amount_krw, refunded_krw, status")
    .eq("booking_id", id)
    .single();
  if (!payment || payment.status !== "paid") throw new Error("결제 내역이 없습니다.");

  const refundAmount = partial > 0 ? Math.min(partial, payment.amount_krw - payment.refunded_krw) : payment.amount_krw;
  const totalRefunded = payment.refunded_krw + refundAmount;
  const isFull = totalRefunded >= payment.amount_krw;

  // 실 PG: 여기서 PG 취소 API 호출. Mock: 상태만 갱신.
  await admin
    .from("payments")
    .update({
      status: isFull ? "refunded" : "partial_refunded",
      refunded_krw: totalRefunded,
      cancelled_at: isFull ? new Date().toISOString() : null,
    })
    .eq("id", payment.id);

  if (isFull) {
    await admin.from("bookings").update({ status: "refunded" }).eq("id", id);
    // 정산 보류 (정산 예정/대기였다면 held 로)
    await admin
      .from("settlements")
      .update({ status: "held" })
      .eq("booking_id", id)
      .in("status", ["pending", "scheduled"]);
    // 슬롯 해제
    if (b.availability_id) {
      await admin.from("availability").update({ is_booked: false }).eq("id", b.availability_id);
    }
  }

  const fmt = new Intl.NumberFormat("ko-KR");
  await notify(admin, b.user_id, "환불 처리됐어요", `₩${fmt.format(refundAmount)} 환불`, `/bookings/${id}`, "payment");
  const { data: ph } = await admin.from("photographers").select("profile_id").eq("id", b.photographer_id).single();
  if (ph) await notify(admin, ph.profile_id, "예약이 환불됐어요", "", `/bookings/${id}`, "payment");

  revalidateBooking(id);
}

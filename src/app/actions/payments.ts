"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { confirmBankTransfer, waiveFee } from "@/lib/payments";

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

// ── 입금 확인 (작가) : accepted → paid + 플랫폼 수수료 발생 ──────────────
// 사용자가 작가 계좌로 직접 송금한 것을 작가가 확인하면 호출. 머니패스의 신뢰 시점.
export async function confirmTransfer(formData: FormData) {
  const id = String(formData.get("id"));
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 가능합니다.");

  const result = await confirmBankTransfer(id, me.photographer.id);
  if (!result.ok) throw new Error("처리할 수 없는 상태입니다.");

  revalidateBooking(id);
  revalidatePath("/studio/settlements");
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

// ── 전달 확인 (구매자) : delivered → completed ──────────────────────
// 직접이체 모델에서는 정산 보류/예약 개념이 없다(작가는 이미 촬영비를 받음).
// 거래 완료만 기록하고 수수료는 입금 확인 시점에 이미 발생해 있다.
export async function confirmCompletion(formData: FormData) {
  const id = String(formData.get("id"));
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요합니다.");

  const admin = createAdminClient();
  const { data: moved } = await admin
    .from("bookings")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", me.id)
    .eq("status", "delivered")
    .select("id, photographer_id");
  if (!moved || moved.length === 0) throw new Error("처리할 수 없는 상태입니다.");

  const { data: ph } = await admin
    .from("photographers")
    .select("profile_id")
    .eq("id", moved[0].photographer_id)
    .single();
  if (ph) await notify(admin, ph.profile_id, "거래가 완료됐어요", "고객이 전달을 확인했습니다.", `/bookings/${id}`);
  revalidateBooking(id);
}

// ── 환불 (구매자 요청 / 운영자) : 오프플랫폼 ─────────────────────────
// 실제 환불 송금은 작가가 직접 사용자에게 한다. 시스템은 상태만 정리:
// 예약 refunded, 결제 환불 표시, 플랫폼 수수료 면제(waived), 슬롯 해제.
export async function refundBooking(formData: FormData) {
  const id = String(formData.get("id"));
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

  // 예약·결제 상태 정리 (전액 환불 기준 — 직접이체라 부분환불은 당사자 간 처리)
  await admin.from("bookings").update({ status: "refunded" }).eq("id", id);
  const { data: payment } = await admin
    .from("payments")
    .select("id, amount_krw")
    .eq("booking_id", id)
    .maybeSingle();
  if (payment) {
    await admin
      .from("payments")
      .update({
        status: "refunded",
        refunded_krw: payment.amount_krw,
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", payment.id);
  }

  // 매칭 수수료 면제
  await waiveFee(admin, id);

  // 슬롯 해제
  if (b.availability_id) {
    await admin.from("availability").update({ is_booked: false }).eq("id", b.availability_id);
  }

  await notify(admin, b.user_id, "환불 처리됐어요", "작가의 환불 송금을 확인해주세요.", `/bookings/${id}`, "payment");
  const { data: ph } = await admin.from("photographers").select("profile_id").eq("id", b.photographer_id).single();
  if (ph) await notify(admin, ph.profile_id, "예약이 환불됐어요", "환불 금액을 고객에게 송금해주세요.", `/bookings/${id}`, "payment");

  revalidateBooking(id);
}

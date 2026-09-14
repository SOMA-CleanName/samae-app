import "server-only";

// 추가 결제의 운영 처리 — 입금 확인·정산·환불. admin/transactions 액션이 부른다.
//
//   pre_shoot  입금 확인 → 예약 총액에 합산: bookings.amount_krw += 금액, fee_snapshot 재계산,
//              platform_fees.fee_krw 갱신, payments.amount_krw 갱신. 이후 위약금·정산은 예약이 알아서.
//   post_shoot 입금 확인 → 이 행의 fee_snapshot 을 굳힌다. 전달 전 환불은 전액, 전달 후는 없음.
//              정산은 전달된 뒤 따로 (settled_at).

import { createAdminClient } from "@/lib/supabase/admin";
import { feeSpecFromRow, feeWithVat, readFeeSnapshot, resolveFee } from "@/lib/platform-fee";
import { snapshotFeeForBooking } from "@/lib/payments";
import { EXTRA_COLS, type BookingExtra } from "@/lib/extras";

const fmt = new Intl.NumberFormat("ko-KR");

async function notify(
  admin: ReturnType<typeof createAdminClient>,
  recipientId: string,
  title: string,
  body: string,
  link: string
) {
  await admin.from("notifications").insert({ recipient_id: recipientId, type: "payment", title, body, link });
}

async function postSystem(admin: ReturnType<typeof createAdminClient>, bookingId: string, body: string) {
  const { data: conv } = await admin.from("conversations").select("id, user_id").eq("booking_id", bookingId).maybeSingle();
  if (!conv) return;
  await admin.from("messages").insert({ conversation_id: conv.id, sender_id: conv.user_id, type: "system", body });
}

export async function listExtrasForAdmin(): Promise<Array<BookingExtra & { booking: { user_id: string; photographer_id: string; amount_krw: number | null } | null }>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("booking_extras")
    .select(`${EXTRA_COLS}, booking:bookings(user_id, photographer_id, amount_krw)`)
    .in("status", ["accepted", "paid"])
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []) as unknown as Array<BookingExtra & { booking: { user_id: string; photographer_id: string; amount_krw: number | null } | null }>;
}

/** 입금 확인 — accepted(입금 알림 있음) → paid */
export async function confirmExtraPaid(extraId: string): Promise<boolean> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: moved } = await admin
    .from("booking_extras")
    .update({ status: "paid", paid_at: now })
    .eq("id", extraId)
    .eq("status", "accepted")
    .select(EXTRA_COLS);
  if (!moved || moved.length === 0) return false;
  const e = moved[0] as BookingExtra;

  const { data: b } = await admin
    .from("bookings")
    .select("id, user_id, photographer_id, amount_krw, fee_snapshot")
    .eq("id", e.booking_id)
    .maybeSingle();
  if (!b) return true;

  if (e.kind === "pre_shoot") {
    // 원 예약에 합산 — 위약금·수수료·정산은 이 총액을 기준으로 (회원약관 8조 3항)
    const total = (b.amount_krw ?? 0) + e.amount_krw;
    const fee = await snapshotFeeForBooking(admin, b.photographer_id, total);
    await admin.from("bookings").update({ amount_krw: total, fee_snapshot: fee }).eq("id", b.id);
    await admin.from("payments").update({ amount_krw: total }).eq("booking_id", b.id);
    await admin
      .from("platform_fees")
      .update({ fee_krw: fee.feeKrw })
      .eq("booking_id", b.id)
      .in("status", ["accrued", "billed"]);
  } else {
    // 결과물 추가금 — 이 행이 따로 수수료를 갖는다
    const { data: ph } = await admin
      .from("photographers")
      .select("fee_mode, fee_amount_krw, fee_rate")
      .eq("id", b.photographer_id)
      .maybeSingle();
    const fee = resolveFee(feeSpecFromRow(ph), e.amount_krw);
    await admin.from("booking_extras").update({ fee_snapshot: fee }).eq("id", extraId);
  }

  await postSystem(
    admin,
    b.id,
    e.kind === "pre_shoot"
      ? `추가 결제 "${e.title}" ₩${fmt.format(e.amount_krw)} 입금이 확인됐어요. 촬영 대금이 ₩${fmt.format((b.amount_krw ?? 0) + e.amount_krw)}으로 합산됐고, 환불 기준도 이 금액으로 계산돼요.`
      : `추가 결제 "${e.title}" ₩${fmt.format(e.amount_krw)} 입금이 확인됐어요. 결과물 전달 전에는 전액 환불되고, 전달 후에는 환불되지 않아요.`
  );
  const { data: ph } = await admin.from("photographers").select("profile_id").eq("id", b.photographer_id).maybeSingle();
  if (ph) await notify(admin, ph.profile_id, "추가 결제 입금이 확인됐어요", `${e.title} ₩${fmt.format(e.amount_krw)}`, `/bookings/${b.id}`);
  await notify(admin, b.user_id, "추가 결제가 확인됐어요", `${e.title} ₩${fmt.format(e.amount_krw)}`, `/bookings/${b.id}`);
  return true;
}

/** 환불 — post_shoot 만, 전달 전 전액. pre_shoot 은 예약 환불에 합산돼 있다 */
export async function refundExtra(extraId: string): Promise<{ ok: boolean; reason?: string }> {
  const admin = createAdminClient();
  const { data: e } = await admin.from("booking_extras").select(EXTRA_COLS).eq("id", extraId).maybeSingle();
  if (!e) return { ok: false, reason: "not_found" };
  const x = e as BookingExtra;
  if (x.kind !== "post_shoot") return { ok: false, reason: "pre_shoot_merged" };
  if (x.status !== "paid") return { ok: false, reason: "not_paid" };
  if (x.delivered_at) return { ok: false, reason: "delivered" };

  const now = new Date().toISOString();
  await admin
    .from("booking_extras")
    .update({ status: "refunded", refunded_at: now, refund_krw: x.amount_krw })
    .eq("id", extraId)
    .eq("status", "paid");
  await postSystem(admin, x.booking_id, `추가 결제 "${x.title}" ₩${fmt.format(x.amount_krw)}이 전액 환불 처리됐어요.`);
  return { ok: true };
}

/** 정산 — post_shoot, 전달된 건만. 수수료·부가세를 뺀 금액을 작가에게 보낸 뒤 기록 */
export async function settleExtra(extraId: string): Promise<{ ok: boolean; reason?: string }> {
  const admin = createAdminClient();
  const { data: e } = await admin
    .from("booking_extras")
    .select(`${EXTRA_COLS}, fee_snapshot, booking:bookings(photographer_id)`)
    .eq("id", extraId)
    .maybeSingle();
  if (!e) return { ok: false, reason: "not_found" };
  const x = e as unknown as BookingExtra & { fee_snapshot: unknown; booking: { photographer_id: string } | null };
  if (x.kind !== "post_shoot" || x.status !== "paid" || !x.delivered_at || x.settled_at)
    return { ok: false, reason: "bad_state" };
  const fee = readFeeSnapshot(x.fee_snapshot) ?? resolveFee(null, x.amount_krw);
  const net = Math.max(0, x.amount_krw - feeWithVat(fee));
  const now = new Date().toISOString();
  await admin.from("booking_extras").update({ settled_at: now, settlement_amount_krw: net }).eq("id", extraId);
  if (x.booking) {
    const { data: ph } = await admin.from("photographers").select("profile_id").eq("id", x.booking.photographer_id).maybeSingle();
    if (ph) await notify(admin, ph.profile_id, "추가 작업 정산이 완료됐어요", `${x.title} ₩${fmt.format(net)} (수수료·부가세 차감 후)`, "/studio/settlements");
  }
  return { ok: true };
}

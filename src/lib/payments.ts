import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ════════════════════════════════════════════════════════════════
// 결제·수수료 도메인 — 사매 계좌 에스크로
//
// 고객은 촬영비 전액을 **사매 계좌**로 입금하고, 사매가 확인한 뒤 수수료를 떼어
// 작가에게 정산한다. 수수료는 입금 확인(accepted→paid) 시점에 발생(accrued)한다.
// write(상태·원장 변경)는 전부 service_role(admin)로만, RLS 는 조회 게이트만 담당한다.
//
// 수수료는 작가별 설정(정액·정률 공존)이다 — 숫자를 직접 읽지 말고 resolveFee() 를 쓸 것.
// 환불 규정은 docs/32-refund-policy.md, 판정은 lib/refund.ts.
// ════════════════════════════════════════════════════════════════

// 수수료 상수·계산은 platform-fee.ts 에 있다 (클라이언트 공용). 호출부 편의를 위해 재수출.
export { PLATFORM_FEE_KRW } from "./platform-fee";
import {
  resolveFee,
  feeSpecFromRow,
  readFeeSnapshot,
  type FeeSnapshot,
} from "./platform-fee";
import { refundQuote, type RefundOverride, type RefundQuote } from "./refund";

const fmtKrw = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

// ── 결제(직접이체 확인) ──────────────────────────────────────────────
export type PaymentStatus =
  | "pending" | "paid" | "failed" | "cancelled" | "refunded" | "partial_refunded";

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: "입금 대기",
  paid: "입금 확인됨",
  failed: "실패",
  cancelled: "취소",
  refunded: "환불 완료",
  partial_refunded: "부분 환불",
};

export type PaymentRow = {
  id: string;
  booking_id: string;
  status: PaymentStatus;
  amount_krw: number;
  refunded_krw: number;
  paid_at: string | null;
  method: string | null;
};

const PAYMENT_COLS = "id, booking_id, status, amount_krw, refunded_krw, paid_at, method";

// ── 플랫폼 수수료 원장 (작가가 낼 매칭 수수료) ────────────────────────
export type FeeStatus = "accrued" | "billed" | "paid" | "waived";

export const FEE_LABEL: Record<FeeStatus, string> = {
  accrued: "발생 (미청구)",
  billed: "청구됨",
  paid: "납부 완료",
  waived: "면제",
};

export type FeeRow = {
  id: string;
  booking_id: string;
  fee_krw: number;
  status: FeeStatus;
  period: string | null;
  accrued_at: string;
  paid_at: string | null;
  booking: { shoot_at: string | null; user: { display_name: string | null } | null } | null;
};

// 작가 수취 계좌 (촬영비 받을 계좌)
export type PayoutAccount = { bank: string; number: string; holder: string };

// ─────────────────────────────────────────────
// 수수료
// ─────────────────────────────────────────────

/**
 * 이 예약에 부과할 수수료를 확정한다.
 *
 * 제안 시점에 굳혀둔 스냅샷(`bookings.fee_snapshot`)이 있으면 그걸 그대로 쓴다 —
 * 그 뒤 작가 요율이 바뀌어도 이미 협의된 거래의 금액이 흔들리면 안 되기 때문이다.
 * 스냅샷이 없는 예약(0101 이전 건)만 현재 설정으로 계산한다.
 */
async function feeForBooking(
  admin: ReturnType<typeof createAdminClient>,
  booking: {
    id: string;
    photographer_id: string;
    amount_krw?: number | null;
    travel_fee_krw?: number | null;
    fee_snapshot?: unknown;
  }
): Promise<FeeSnapshot> {
  const stored = readFeeSnapshot(booking.fee_snapshot);
  if (stored) return stored;

  const shootFee = Math.max(0, (booking.amount_krw ?? 0) - (booking.travel_fee_krw ?? 0));
  const { data: ph } = await admin
    .from("photographers")
    .select("fee_mode, fee_amount_krw, fee_rate")
    .eq("id", booking.photographer_id)
    .maybeSingle();
  return resolveFee(feeSpecFromRow(ph), shootFee);
}

/** 제안 시점에 수수료 근거를 굳힌다 — 예약 생성·수정에서 호출 */
export async function snapshotFeeForBooking(
  admin: ReturnType<typeof createAdminClient>,
  photographerId: string,
  amountKrw: number,
  travelFeeKrw: number
): Promise<FeeSnapshot> {
  const { data: ph } = await admin
    .from("photographers")
    .select("fee_mode, fee_amount_krw, fee_rate")
    .eq("id", photographerId)
    .maybeSingle();
  return resolveFee(feeSpecFromRow(ph), Math.max(0, amountKrw - travelFeeKrw));
}

// ─────────────────────────────────────────────
// 조회
// ─────────────────────────────────────────────

// 예약의 결제 1건 (RLS: 참여자 조회)
export async function getPaymentByBooking(bookingId: string): Promise<PaymentRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payments")
    .select(PAYMENT_COLS)
    .eq("booking_id", bookingId)
    .maybeSingle();
  return (data as PaymentRow) ?? null;
}

// 예약의 수수료 1건 (RLS: 작가 본인)
export async function getFeeByBooking(bookingId: string): Promise<FeeRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_fees")
    .select("id, booking_id, fee_krw, status, period, accrued_at, paid_at")
    .eq("booking_id", bookingId)
    .maybeSingle();
  return (data as unknown as FeeRow) ?? null;
}

// 예약 구매자에게 작가 수취 계좌 노출.
// 호출자가 이 예약의 참여자일 때만(= booking 이 RLS 로 보일 때만) 계좌를 반환한다.
// 계좌 자체는 소유자만 RLS 조회 가능하므로 admin 으로 읽되, 노출 게이트는 위 검증이 담당.
export async function getPayoutAccountForBooking(bookingId: string): Promise<PayoutAccount | null> {
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("photographer_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return null; // 참여자 아님 또는 없음

  const admin = createAdminClient();
  const { data } = await admin
    .from("payout_accounts")
    .select("bank, number, holder")
    .eq("photographer_id", booking.photographer_id)
    .maybeSingle();
  return (data as PayoutAccount) ?? null;
}

// 작가 수취 계좌를 photographer_id 로 조회 (채팅 송금 카드용).
// ⚠️ 계좌는 민감정보다. 호출자가 '이 작가와의 대화 참여자'임을 반드시 먼저 보장해야 한다
//    (채팅방 진입 시 getConversation 이 RLS 로 참여 여부를 이미 검증).
export async function getPhotographerPayoutAccount(
  photographerId: string
): Promise<PayoutAccount | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("payout_accounts")
    .select("bank, number, holder")
    .eq("photographer_id", photographerId)
    .maybeSingle();
  return (data as PayoutAccount) ?? null;
}

// ─────────────────────────────────────────────
// 쓰기 (service_role 전용)
// ─────────────────────────────────────────────

// 알림 생성
async function notify(
  admin: ReturnType<typeof createAdminClient>,
  recipientId: string,
  title: string,
  body: string,
  link: string,
  type: "payment" | "settlement" = "payment"
) {
  await admin.from("notifications").insert({ recipient_id: recipientId, type, title, body, link });
}

// 송금 대기 결제 레코드 보장 (구매자가 송금 안내를 열 때). 멱등(booking_id unique).
export async function ensureTransferRecord(bookingId: string, amountKrw: number): Promise<void> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("payments")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (existing) return;
  await admin.from("payments").insert({
    booking_id: bookingId,
    status: "pending",
    provider: "bank_transfer",
    method: "bank_transfer",
    amount_krw: amountKrw,
  });
}

export type ConfirmResult = { ok: true } | { ok: false; reason: "bad_state" };

// 작가 입금 확인: accepted → paid + 결제 확정 + 플랫폼 수수료 발생(accrued).
// 낙관적 동시성(작가 본인 + 현재 accepted 조건부 update). 멱등(payments/fees booking_id unique).
export async function confirmBankTransfer(
  bookingId: string,
  photographerId: string
): Promise<ConfirmResult> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: moved } = await admin
    .from("bookings")
    .update({ status: "paid", paid_at: now })
    .eq("id", bookingId)
    .eq("photographer_id", photographerId)
    .eq("status", "accepted")
    .select("id, user_id, photographer_id, amount_krw, travel_fee_krw, fee_snapshot");
  if (!moved || moved.length === 0) return { ok: false, reason: "bad_state" };
  const b = moved[0];

  // 입금 확인 기록 (송금 대기 레코드가 있으면 갱신, 없으면 생성)
  await admin.from("payments").upsert(
    {
      booking_id: bookingId,
      status: "paid",
      provider: "bank_transfer",
      method: "bank_transfer",
      amount_krw: b.amount_krw ?? 0,
      paid_at: now,
    },
    { onConflict: "booking_id" }
  );

  // 플랫폼 수수료 발생 (작가 부담, 월 누적). 멱등.
  // 금액은 제안 시점 스냅샷 기준 — 그 사이 요율이 바뀌어도 협의된 거래는 흔들리지 않는다.
  const fee = await feeForBooking(admin, b);
  await admin.from("platform_fees").upsert(
    {
      booking_id: bookingId,
      photographer_id: b.photographer_id,
      fee_krw: fee.feeKrw,
      status: "accrued",
      period: now.slice(0, 7), // 'YYYY-MM' (UTC 기준 — 청구 정밀화는 운영 시 보정)
      accrued_at: now,
    },
    { onConflict: "booking_id", ignoreDuplicates: true }
  );

  // 양측 알림
  const link = `/bookings/${bookingId}`;
  await notify(admin, b.user_id, "입금이 확인됐어요", "작가가 촬영을 준비합니다.", link);
  const { data: ph } = await admin
    .from("photographers")
    .select("profile_id")
    .eq("id", b.photographer_id)
    .single();
  if (ph)
    await notify(
      admin,
      ph.profile_id,
      "입금을 확인했어요",
      `매칭 수수료 ₩${fmtKrw(fee.feeKrw)} 이 부과됐습니다.`,
      "/studio/settlements",
      "settlement"
    );

  return { ok: true };
}

// 운영자 입금 확인 (에스크로) — 고객이 **사매 계좌**로 입금 → 운영자가 확인: accepted → paid.
// 작가 confirm 과 달리 photographer 조건 없이 어드민 권한으로 전이한다. 멱등.
// 정산(사매→작가 송금)은 markSettlementPaid 에서 별도 기록.
export async function confirmBankTransferAdmin(bookingId: string): Promise<ConfirmResult> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: moved } = await admin
    .from("bookings")
    .update({ status: "paid", paid_at: now })
    .eq("id", bookingId)
    .eq("status", "accepted")
    .select("id, user_id, photographer_id, amount_krw, travel_fee_krw, fee_snapshot");
  if (!moved || moved.length === 0) return { ok: false, reason: "bad_state" };
  const b = moved[0];

  await admin.from("payments").upsert(
    {
      booking_id: bookingId,
      status: "paid",
      provider: "bank_transfer",
      method: "bank_transfer",
      amount_krw: b.amount_krw ?? 0,
      paid_at: now,
    },
    { onConflict: "booking_id" }
  );

  // 수수료 발생 — 정산 시 송금액에서 선취 상계
  const fee = await feeForBooking(admin, b);
  await admin.from("platform_fees").upsert(
    {
      booking_id: bookingId,
      photographer_id: b.photographer_id,
      fee_krw: fee.feeKrw,
      status: "accrued",
      period: now.slice(0, 7),
      accrued_at: now,
    },
    { onConflict: "booking_id", ignoreDuplicates: true }
  );

  const link = `/bookings/${bookingId}`;
  await notify(admin, b.user_id, "입금이 확인됐어요", "예약이 확정됐어요. 작가가 촬영을 준비합니다.", link);
  const { data: ph } = await admin
    .from("photographers")
    .select("profile_id")
    .eq("id", b.photographer_id)
    .single();
  if (ph)
    await notify(
      admin,
      ph.profile_id,
      "예약이 확정됐어요",
      `사매가 입금을 확인했어요. 촬영비는 수수료(₩${fmtKrw(fee.feeKrw)}) 차감 후 정산해드려요.`,
      "/studio/settlements",
      "settlement"
    );
  return { ok: true };
}

// 정산 완료 (에스크로) — 사매가 수수료를 뗀 금액을 작가 계좌로 송금한 뒤 기록.
export async function markSettlementPaid(bookingId: string): Promise<ConfirmResult> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id, status, amount_krw, travel_fee_krw, fee_snapshot, user_id, photographer_id, settled_at"
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking || booking.settled_at) return { ok: false, reason: "bad_state" };
  if (!["paid", "shot", "delivered", "completed"].includes(booking.status as string))
    return { ok: false, reason: "bad_state" };

  const { data: feeRow } = await admin
    .from("platform_fees")
    .select("fee_krw")
    .eq("booking_id", bookingId)
    .maybeSingle();
  const feeKrw = feeRow?.fee_krw ?? (await feeForBooking(admin, booking)).feeKrw;
  const settlementAmount = Math.max(0, (booking.amount_krw ?? 0) - feeKrw);

  await admin
    .from("bookings")
    .update({ settled_at: now, settlement_amount_krw: settlementAmount })
    .eq("id", bookingId);
  // 수수료는 송금액에서 상계했으므로 납부 완료 처리
  await admin
    .from("platform_fees")
    .update({ status: "paid", paid_at: now })
    .eq("booking_id", bookingId)
    .in("status", ["accrued", "billed"]);

  const { data: ph } = await admin
    .from("photographers")
    .select("profile_id")
    .eq("id", booking.photographer_id)
    .single();
  if (ph)
    await notify(
      admin,
      ph.profile_id,
      "정산이 완료됐어요",
      `촬영비 ₩${fmtKrw(settlementAmount)} 을 보내드렸어요 (수수료 차감 후).`,
      "/studio/settlements",
      "settlement"
    );

  // 채팅방에는 남기지 않는다 — 정산은 사매와 작가 사이의 일이고,
  // 수령 확인도 카톡으로 오간다. 고객에게는 알 필요도, 알아서 좋을 것도 없다.
  // (고객 입장에서 예약은 [입금 완료]를 누른 순간 끝났다)
  return { ok: true };
}

// ─────────────────────────────────────────────
// 환불 (docs/32)
// ─────────────────────────────────────────────

/** 환불 견적 — 판정만 하고 아무것도 바꾸지 않는다 (어드민 화면이 먼저 보여주는 값) */
export async function quoteRefund(
  bookingId: string,
  override?: RefundOverride | null
): Promise<(RefundQuote & { amountKrw: number }) | null> {
  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select(
      "id, status, amount_krw, travel_fee_krw, fee_snapshot, shoot_at, shoot_date, transfer_marked_at, photographer_id"
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return null;

  const fee = await feeForBooking(admin, b);
  // 연락처가 실제로 오간 시각 — '교환 가능해진 시각'이 아니라 '오간 시각'이 기준이다
  const { data: conv } = await admin
    .from("conversations")
    .select("contact_exchanged_at")
    .eq("booking_id", bookingId)
    .maybeSingle();

  const quote = refundQuote({
    shootAt: b.shoot_at,
    shootDate: b.shoot_date,
    transferMarkedAt: b.transfer_marked_at,
    contactExchangedAt: conv?.contact_exchanged_at ?? null,
    amountKrw: b.amount_krw ?? 0,
    travelFeeKrw: b.travel_fee_krw ?? 0,
    feeKrw: fee.feeKrw,
    override,
  });
  return { ...quote, amountKrw: b.amount_krw ?? 0 };
}

/**
 * 환불 실행 — 운영이 실제로 돈을 돌려보낸 뒤 기록한다.
 *
 * 사매는 자금을 직접 이체하는 주체이므로 여기서 하는 일은 **원장 정리**다:
 * 예약을 refunded 로 닫고, payments 에 환불액을 남기고, 수수료를 면제하거나 유지한다.
 * 판정 자체는 quoteRefund 가 하고, 운영이 그 결과를 보고 실행한다.
 */
export async function refundBooking(
  bookingId: string,
  opts: { override?: RefundOverride | null; note?: string } = {}
): Promise<ConfirmResult> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const quote = await quoteRefund(bookingId, opts.override);
  if (!quote) return { ok: false, reason: "bad_state" };

  const { data: b } = await admin
    .from("bookings")
    .select("id, status, user_id, photographer_id, refunded_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b || b.refunded_at) return { ok: false, reason: "bad_state" };

  await admin
    .from("bookings")
    .update({
      status: "refunded",
      refunded_at: now,
      refund_reason: quote.basis,
      cancel_reason: opts.note?.trim() || quote.reason,
      cancelled_at: now,
    })
    .eq("id", bookingId);

  // 결제 원장 — 전액이면 refunded, 일부면 partial_refunded
  await admin
    .from("payments")
    .update({
      status: quote.percent >= 100 ? "refunded" : "partial_refunded",
      refunded_krw: quote.refundKrw,
    })
    .eq("booking_id", bookingId);

  if (quote.feeWaived) {
    await waiveFee(admin, bookingId);
  }

  const link = `/bookings/${bookingId}`;
  await notify(
    admin,
    b.user_id,
    quote.percent > 0 ? "환불이 처리됐어요" : "예약이 취소됐어요",
    quote.percent > 0
      ? `₩${fmtKrw(quote.refundKrw)} 을 환불해드렸어요. ${quote.reason}`
      : quote.reason,
    link
  );

  const { data: ph } = await admin
    .from("photographers")
    .select("profile_id")
    .eq("id", b.photographer_id)
    .single();
  if (ph)
    await notify(
      admin,
      ph.profile_id,
      "예약이 환불 처리됐어요",
      quote.photographerNetKrw >= 0
        ? `정산 금액은 ₩${fmtKrw(quote.photographerNetKrw)} 이에요.`
        : `수수료 ₩${fmtKrw(-quote.photographerNetKrw)} 이 작가님 부담으로 남아요.`,
      "/studio/settlements",
      "settlement"
    );

  return { ok: true };
}

// 환불 시 수수료 면제 (accrued/billed → waived)
export async function waiveFee(
  admin: ReturnType<typeof createAdminClient>,
  bookingId: string
): Promise<void> {
  await admin
    .from("platform_fees")
    .update({ status: "waived" })
    .eq("booking_id", bookingId)
    .in("status", ["accrued", "billed"]);
}

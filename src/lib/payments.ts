import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ════════════════════════════════════════════════════════════════
// 결제·수수료 도메인 — 직접 계좌이체 모델
//
// 사용자는 촬영비 전액을 작가 계좌로 "직접" 송금한다(오프플랫폼).
// 플랫폼은 매칭 건당 PLATFORM_FEE_KRW 원을 작가에게 부과하며,
// 작가의 입금 확인(accepted→paid) 시점에 발생(accrued)시켜 월 단위로
// 누적·청구한다. write(상태·원장 변경)는 전부 service_role(admin)로만,
// RLS 는 조회 게이트만 담당한다.
// ════════════════════════════════════════════════════════════════

// 매칭 건당 플랫폼 수수료 (작가 부담, 정액)
export const PLATFORM_FEE_KRW = 6000;

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
    .select("id, user_id, photographer_id, amount_krw");
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
  await admin.from("platform_fees").upsert(
    {
      booking_id: bookingId,
      photographer_id: b.photographer_id,
      fee_krw: PLATFORM_FEE_KRW,
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
      `매칭 수수료 ₩${fmtKrw(PLATFORM_FEE_KRW)} 이 부과됐습니다.`,
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

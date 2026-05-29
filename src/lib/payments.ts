import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { newPgTxId, type PgWebhookEvent } from "@/lib/pg-mock";

// ════════════════════════════════════════════════════════════════
// 결제·정산 도메인
// write(돈·상태 변경)는 전부 service_role(admin)로만. RLS는 조회만 허용.
// 상태 전이 신뢰의 원천은 PG webhook (→ applyPaymentPaid).
// ════════════════════════════════════════════════════════════════

export type PaymentStatus =
  | "pending" | "paid" | "failed" | "cancelled" | "refunded" | "partial_refunded";
export type SettlementStatus = "pending" | "scheduled" | "paid" | "held";

// 플랫폼 수수료율 (초안 — 운영정책 확정 전 placeholder, docs/06 참고)
export const FEE_RATE = 0.15;

// 거래액 → {수수료, 작가 수령액}
export function computeFee(grossKrw: number): { fee: number; net: number } {
  const fee = Math.round(grossKrw * FEE_RATE);
  return { fee, net: grossKrw - fee };
}

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: "결제 대기",
  paid: "결제 완료",
  failed: "결제 실패",
  cancelled: "결제 취소",
  refunded: "환불 완료",
  partial_refunded: "부분 환불",
};

export const SETTLEMENT_LABEL: Record<SettlementStatus, string> = {
  pending: "정산 대기 (에스크로 보류)",
  scheduled: "정산 예정",
  paid: "정산 완료",
  held: "정산 보류 (분쟁)",
};

export type PaymentRow = {
  id: string;
  booking_id: string;
  status: PaymentStatus;
  provider: string | null;
  amount_krw: number;
  refunded_krw: number;
  paid_at: string | null;
};

export type SettlementRow = {
  id: string;
  booking_id: string;
  gross_krw: number;
  fee_krw: number;
  net_krw: number;
  status: SettlementStatus;
  scheduled_at: string | null;
  paid_at: string | null;
  booking: { shoot_at: string | null; user: { display_name: string | null } | null } | null;
};

const PAYMENT_COLS = "id, booking_id, status, provider, amount_krw, refunded_krw, paid_at";

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

// 예약의 정산 1건 (RLS: 작가 본인)
export async function getSettlementByBooking(bookingId: string): Promise<SettlementRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settlements")
    .select("id, booking_id, gross_krw, fee_krw, net_krw, status, scheduled_at, paid_at")
    .eq("booking_id", bookingId)
    .maybeSingle();
  return (data as unknown as SettlementRow) ?? null;
}

// 내 정산 목록 (RLS: 작가 본인)
export async function listMySettlements(): Promise<SettlementRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settlements")
    .select(
      "id, booking_id, gross_krw, fee_krw, net_krw, status, scheduled_at, paid_at, " +
        "booking:bookings(shoot_at, user:profiles!bookings_user_id_fkey(display_name))"
    )
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as SettlementRow[];
}

// 알림 생성 (service_role)
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

export type PendingPayment = { pg_tx_id: string; amount_krw: number; status: PaymentStatus };

// ── 결제 사전등록(prepare): 서버가 금액을 생성·보관 ──────────────────
// 클라이언트가 보내는 금액은 신뢰하지 않는다. 멱등(booking_id unique).
export async function ensurePendingPayment(
  bookingId: string,
  amountKrw: number
): Promise<PendingPayment> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("payments")
    .select("pg_tx_id, amount_krw, status")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (existing) return existing as PendingPayment;

  const row = {
    booking_id: bookingId,
    status: "pending" as const,
    provider: process.env.PAYMENT_PROVIDER || "mock",
    pg_tx_id: newPgTxId(),
    amount_krw: amountKrw,
    idempotency_key: `pay_${bookingId}`,
  };
  const { data, error } = await admin
    .from("payments")
    .insert(row)
    .select("pg_tx_id, amount_krw, status")
    .single();
  if (error) {
    // 동시 prepare 경쟁: 이미 생성됐으면 그것을 반환
    const { data: again } = await admin
      .from("payments")
      .select("pg_tx_id, amount_krw, status")
      .eq("booking_id", bookingId)
      .single();
    return again as PendingPayment;
  }
  return data as PendingPayment;
}

export type ApplyPaidResult =
  | { ok: true; idempotent: boolean }
  | { ok: false; reason: "not_found" | "amount_mismatch" | "bad_state" };

// ── PG 결제 성공 확정 (webhook 신뢰 경계 통과 후 호출) ───────────────
// 멱등: 동일 결제 재수신 시 부수효과 없이 ok 반환.
export async function applyPaymentPaid(event: PgWebhookEvent): Promise<ApplyPaidResult> {
  const admin = createAdminClient();

  // prepare 단계에서 만든 결제 레코드 (서버 보관 금액의 원천)
  const { data: payment } = await admin
    .from("payments")
    .select("id, booking_id, status, amount_krw")
    .eq("pg_tx_id", event.pg_tx_id)
    .maybeSingle();
  if (!payment || payment.booking_id !== event.booking_id) return { ok: false, reason: "not_found" };

  // 멱등: 이미 결제 완료 처리됨
  if (payment.status === "paid") return { ok: true, idempotent: true };
  if (payment.status !== "pending") return { ok: false, reason: "bad_state" };

  // 금액 대조 — 클라이언트/PG 통지 금액이 아니라 서버 보관 금액과 일치해야 함
  if (event.amount_krw !== payment.amount_krw) return { ok: false, reason: "amount_mismatch" };

  // 예약 전이 (accepted → paid). 현재 status 조건부 update = 낙관적 동시성.
  const { data: moved } = await admin
    .from("bookings")
    .update({ status: "paid", paid_at: event.paid_at })
    .eq("id", payment.booking_id)
    .eq("status", "accepted")
    .select("id, user_id, photographer_id, amount_krw");
  if (!moved || moved.length === 0) return { ok: false, reason: "bad_state" };
  const booking = moved[0];

  // 결제 레코드 확정
  await admin
    .from("payments")
    .update({ status: "paid", paid_at: event.paid_at, raw: event })
    .eq("id", payment.id);

  // 정산 레코드 생성 (에스크로 보류 = pending). 멱등(booking_id unique).
  const { fee, net } = computeFee(payment.amount_krw);
  await admin.from("settlements").upsert(
    {
      booking_id: payment.booking_id,
      photographer_id: booking.photographer_id,
      gross_krw: payment.amount_krw,
      fee_krw: fee,
      net_krw: net,
      status: "pending",
    },
    { onConflict: "booking_id", ignoreDuplicates: true }
  );

  // 양측 알림
  const link = `/bookings/${payment.booking_id}`;
  const { data: ph } = await admin
    .from("photographers")
    .select("profile_id")
    .eq("id", booking.photographer_id)
    .single();
  await notify(admin, booking.user_id, "결제가 완료됐어요", "촬영을 기다려주세요.", link);
  if (ph) await notify(admin, ph.profile_id, "예약이 결제됐어요", "촬영 일정을 확인하세요.", link);

  return { ok: true, idempotent: false };
}

// ── 전달 확인 시 정산 예약 (completed 전이의 부수효과) ────────────────
export async function scheduleSettlementOnComplete(
  admin: ReturnType<typeof createAdminClient>,
  bookingId: string,
  completedAt: string
) {
  // pending(보류) → scheduled(정산 예정). 정산 주기는 운영정책(여기선 즉시 예정).
  await admin
    .from("settlements")
    .update({ status: "scheduled", scheduled_at: completedAt })
    .eq("booking_id", bookingId)
    .eq("status", "pending");
}

// ── 정산 확정 배치: 예정(scheduled)이고 도래한 건 → paid ──────────────
export async function runDueSettlements(nowIso: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("settlements")
    .update({ status: "paid", paid_at: nowIso })
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .select("id, photographer_id, net_krw, booking_id");
  const rows = data ?? [];
  for (const s of rows) {
    const { data: ph } = await admin
      .from("photographers")
      .select("profile_id")
      .eq("id", s.photographer_id)
      .single();
    if (ph)
      await notify(
        admin,
        ph.profile_id,
        "정산이 완료됐어요",
        `₩${new Intl.NumberFormat("ko-KR").format(s.net_krw)} 이 정산되었습니다.`,
        `/studio/settlements`,
        "settlement"
      );
  }
  return rows.length;
}

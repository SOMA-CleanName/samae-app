import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  notifyBookingConfirmedToPhotographer,
  notifyDepositConfirmed,
  notifySettlementPaid,
} from "@/lib/notify-user";

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
  feeRateOf,
  feeWithVat,
  vatOnFee,
  type FeeSnapshot,
} from "./platform-fee";
import { refundQuote, penaltyStarts, type RefundOverride, type RefundQuote } from "./refund";
import { currentPolicySnapshot } from "./policy-version";
import { computeDeliveryDueAt, deliveryDaysOf } from "./delivery-deadline";

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

  // 기준은 촬영 대금 전체(출장비 포함) — 수수료정책 1조 3항
  const { data: ph } = await admin
    .from("photographers")
    .select("fee_mode, fee_amount_krw, fee_rate")
    .eq("id", booking.photographer_id)
    .maybeSingle();
  return resolveFee(feeSpecFromRow(ph), booking.amount_krw ?? 0);
}

/**
 * 수수료 근거를 굳힌다 — 예약 생성·수정에서 호출하고, 입금 확인 때 한 번 더 확정한다.
 * 정책은 "확정 시점 요율"(수수료정책 2조 4항)이라 제안~입금 사이에 요율이 바뀌면 입금 확인 쪽이 진실이다.
 * 기준은 촬영 대금 전체다 — 출장비를 빼지 않는다 (수수료정책 1조 3항).
 */
export async function snapshotFeeForBooking(
  admin: ReturnType<typeof createAdminClient>,
  photographerId: string,
  amountKrw: number
): Promise<FeeSnapshot> {
  const { data: ph } = await admin
    .from("photographers")
    .select("fee_mode, fee_amount_krw, fee_rate")
    .eq("id", photographerId)
    .maybeSingle();
  return resolveFee(feeSpecFromRow(ph), amountKrw);
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

// ── 삭제됨: getPayoutAccountForBooking ───────────────────────────
// *"예약 구매자에게 작가 수취 계좌 노출"* — 고객이 작가 계좌로 직접 보내던 리드 시절
// 함수다. 에스크로 전환 뒤로 호출부가 하나도 남지 않았고(고객이 보는 계좌는 전부
// getPlatformAccount = 사매 계좌), **고객에게 작가 계좌를 내주는 함수가 살아 있는 것
// 자체가 위험**해서 지웠다. 작가 본인/정산용 조회는 아래 getPhotographerPayoutAccount.

// 작가 수취 계좌를 photographer_id 로 조회 (정산 송금용).
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
    .select(
      "id, user_id, photographer_id, amount_krw, travel_fee_krw, fee_snapshot, transfer_marked_at, shoot_at, shoot_date"
    );
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
  await postDepositNotice(admin, bookingId, b.shoot_at ?? null, b.shoot_date ?? null);
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
    .select(
      "id, user_id, photographer_id, amount_krw, travel_fee_krw, fee_snapshot, transfer_marked_at, shoot_at, shoot_date, policy_snapshot, package_snapshot"
    );
  if (!moved || moved.length === 0) return { ok: false, reason: "bad_state" };
  const b = moved[0];

  // 확정 시점의 근거를 굳힌다 — 요율(수수료정책 2조 4항)과 정책 버전(취소환불 14조 2항).
  // 제안 때 찍은 스냅샷이 있어도 여기서 다시 확정한다: 그 사이 요율이 바뀌었으면 확정 시점이 진실이다.
  const confirmedFee = await snapshotFeeForBooking(admin, b.photographer_id, b.amount_krw ?? 0);
  // 결과물 전달 기한 — 촬영일 + 상품에 적은 일수(없으면 21일). 회원약관 10조 5항
  const deliveryDue = computeDeliveryDueAt(b.shoot_at, b.shoot_date, deliveryDaysOf(b.package_snapshot));
  await admin
    .from("bookings")
    .update({
      fee_snapshot: confirmedFee,
      policy_snapshot: b.policy_snapshot ?? currentPolicySnapshot(),
      delivery_due_at: deliveryDue ? deliveryDue.toISOString() : null,
    })
    .eq("id", bookingId);
  b.fee_snapshot = confirmedFee;

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
  await postDepositNotice(admin, bookingId, b.shoot_at ?? null, b.shoot_date ?? null);
  const { data: ph } = await admin
    .from("photographers")
    .select("profile_id, display_name")
    .eq("id", b.photographer_id)
    .single();
  if (ph)
    await notify(
      admin,
      ph.profile_id,
      "예약이 확정됐어요",
      `사매가 입금을 확인했어요. 촬영비는 수수료(₩${fmtKrw(fee.feeKrw)}, 부가세 ₩${fmtKrw(fee.vatKrw)}) 차감 후 정산해드려요.`,
      "/studio/settlements",
      "settlement"
    );

  // 돈이 오간 지점 — 양쪽 다 앱 밖으로 알린다 (예약당 각 1회).
  // 고객은 "확정됐다", 작가는 "촬영 준비 + 정산 예정액" 을 알아야 한다.
  const { data: customer } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", b.user_id)
    .maybeSingle();
  await notifyDepositConfirmed({
    bookingId,
    userProfileId: b.user_id,
    photographerName: ph?.display_name ?? "작가",
    shootAt: b.shoot_at,
    shootDate: b.shoot_date,
  });
  if (ph)
    await notifyBookingConfirmedToPhotographer({
      bookingId,
      photographerProfileId: ph.profile_id,
      customerName: customer?.display_name ?? "고객",
      shootAt: b.shoot_at,
      shootDate: b.shoot_date,
      settlementKrw: Math.max(0, (b.amount_krw ?? 0) - feeWithVat(fee)),
    });
  return { ok: true };
}

// 정산 완료 (에스크로) — 사매가 수수료를 뗀 금액을 작가 계좌로 송금한 뒤 기록.
export async function markSettlementPaid(bookingId: string): Promise<ConfirmResult> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id, status, amount_krw, travel_fee_krw, fee_snapshot, user_id, photographer_id, settled_at, shoot_at, shoot_date, delivered_at"
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking || booking.settled_at) return { ok: false, reason: "bad_state" };
  if (!["paid", "shot", "delivered", "completed"].includes(booking.status as string))
    return { ok: false, reason: "bad_state" };
  // 정산은 결과물을 전달한 뒤에만 (수수료정책 3조 1항). 촬영 전 정산은 막는다.
  if (!booking.delivered_at) return { ok: false, reason: "bad_state" };

  const { data: feeRow } = await admin
    .from("platform_fees")
    .select("fee_krw")
    .eq("booking_id", bookingId)
    .maybeSingle();
  const feeKrw = feeRow?.fee_krw ?? (await feeForBooking(admin, booking)).feeKrw;
  const vatKrw = vatOnFee(feeKrw);

  // 사업자 유형은 **증빙 종류를 가른다** — 사업자면 세금계산서, 미등록이면 영수증
  // (작가약관 14-2). 원천징수는 안 하지만 이건 남겨야 한다. 오히려 우리가 원천징수를
  // 하지 않으니 작가가 5월에 경비로 뺄 유일한 증빙이라 더 중요해졌다.
  const { data: phBiz } = await admin
    .from("photographers")
    .select("business_type")
    .eq("id", booking.photographer_id)
    .maybeSingle();
  const amountKrw = booking.amount_krw ?? 0;

  // 정산액 = 대금 − 수수료 − 부가세.
  // 원천징수는 하지 않는다 — 대금이 사매 계좌를 거치지 않아 우리가 '지급하는 자'(소득세법
  // 127조)가 아니다. 작가가 5월에 직접 신고한다 (126 국세상담, 2026-09-16).
  const settlementAmount = Math.max(0, amountKrw - feeKrw - vatKrw);

  await admin
    .from("bookings")
    .update({
      settled_at: now,
      settlement_amount_krw: settlementAmount,
      // 지급 시점의 계산을 통째로 붙잡아 둔다 — 요율·사업자 유형은 나중에 바뀌고,
      // 그러면 "왜 이 금액이었나" 를 재현할 수 없다. 정산 내역서가 여기서 읽는다.
      settlement_breakdown: {
        amountKrw,
        feeKrw,
        vatKrw,
        businessType: phBiz?.business_type ?? null,
        settlementKrw: settlementAmount,
        at: now,
      },
    })
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

  // 실제로 돈이 나간 사실은 반드시 밖으로 알린다 — 작가가 통장을 확인해야 루프가 닫힌다
  if (ph)
    await notifySettlementPaid({
      bookingId,
      photographerProfileId: ph.profile_id,
      shootAt: booking.shoot_at,
      shootDate: booking.shoot_date,
      settlementKrw: settlementAmount,
    });

  // 채팅방에는 남기지 않는다 — 정산은 사매와 작가 사이의 일이고,
  // 수령 확인도 카톡으로 오간다. 고객에게는 알 필요도, 알아서 좋을 것도 없다.
  // (고객 입장에서 예약은 [입금 완료]를 누른 순간 끝났다)
  return { ok: true };
}


/**
 * 입금 확인 직후 채팅에 남기는 안내 (docs/32 §6-3).
 *
 * 환불 마감일과 연락처 개방일을 **날짜로** 박는다. "7일 이내" 는 계산을 요구하고,
 * 계산하지 않은 고객은 나중에 "몰랐다" 고 말한다. 연락처 잠금도 감추지 않고 예고한다 —
 * "왜 번호가 안 보이지" 라는 문의를 없애고, 정책을 인지한 시점이 기록으로 남는다.
 */
async function postDepositNotice(
  admin: ReturnType<typeof createAdminClient>,
  bookingId: string,
  shootAt: string | null,
  shootDate: string | null
): Promise<void> {
  const { data: conv } = await admin
    .from("conversations")
    .select("id, user_id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!conv) return;

  const day = (d: Date) =>
    new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(d);
  // 구간이 바뀌는 날을 날짜로 박는다 — "7일 전" 은 고객이 계산해야 하고, 계산하지 않은 고객은 "몰랐다" 고 말한다
  const starts = penaltyStarts(shootAt, shootDate);
  const lines = ["입금이 확인되었습니다. 예약이 확정됐어요.", ""];
  if (starts) {
    // 40% 시작일 전날까지 = 8일 이상 구간
    const lastFree = new Date(starts.at40.getTime() - 24 * 60 * 60 * 1000);
    lines.push(`· ${day(lastFree)}까지 취소하시면 전액 환불됩니다`);
    lines.push(`· ${day(starts.at40)}부터는 지불 금액의 60%, ${day(starts.at90)}부터는 10%가 환불됩니다`);
  }
  lines.push("· 촬영 준비는 이 채팅으로 이야기해주세요");
  lines.push("  작가님 연락처는 작가님이 보내주시면 받을 수 있어요");

  // sender_id 는 NOT NULL 이다. 시스템 안내는 고객을 발신자로 둔다 —
  // 가운데 정렬 회색 칩으로 그려져 누가 보냈는지는 화면에 드러나지 않는다.
  await admin.from("messages").insert({
    conversation_id: conv.id,
    sender_id: conv.user_id,
    type: "system",
    body: lines.join("\n"),
  });
}

/**
 * 연락처 수령 직후 채팅에 남기는 안내 (docs/32 §3-3).
 *
 * 받기 전 동의 카드에서 이미 보여주긴 했다. 다만 그 카드는 누르는 순간 연락처 카드로
 * 바뀌어 사라진다 — 조건이 어떻게 달라졌는지 다시 볼 데가 없어진다.
 * 입금 확인 안내와 같은 이유로, 금액과 날짜를 박아 대화에 남긴다.
 * 나중에 "그런 얘기 못 들었다" 가 나오면 이 줄이 근거가 된다.
 */
export async function postContactDeliveredNotice(bookingId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: conv } = await admin
    .from("conversations")
    .select("id, user_id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!conv) return;

  // 연락처 수령은 환불과 무관하다(취소환불정책 1.0 — 옛 규정의 '연락처 = 50% 구간' 은 폐지).
  // 여기서는 용도 제한(회원약관 6조 4항)만 남긴다.
  const lines = [
    "작가님 연락처를 받으셨어요.",
    "",
    "· 연락처는 이 촬영의 상담과 진행에만 사용해 주세요. 다른 목적으로 쓰거나 다른 사람에게 알려주시면 안 돼요",
    "· 촬영 준비는 작가님과 직접 이야기하셔도 되고, 이 채팅도 그대로 쓰실 수 있어요",
  ];

  // sender_id 는 NOT NULL — 시스템 안내는 고객을 발신자로 둔다(가운데 회색 칩으로 그려진다)
  await admin.from("messages").insert({
    conversation_id: conv.id,
    sender_id: conv.user_id,
    type: "system",
    body: lines.join("\n"),
  });
}

/**
 * 운영이 고객 대신 입금 표시 (고객이 [입금 완료] 를 누르지 않은 건).
 *
 * 통장에는 돈이 들어왔는데 고객이 버튼을 안 눌러 거래가 멈추는 일이 실제로 생긴다.
 * 그때 운영이 대신 표시한다 — 확인 주체는 어차피 사매이고, 버튼은 '고객이 알렸다' 는
 * 신호일 뿐이라 없다고 정산을 막을 이유가 없다.
 *
 * ⚠️ transfer_marked_at 은 청약철회 7일의 기산점이다(docs/32 §3-2). 실제 입금일보다
 *    늦게 찍히면 고객의 철회 기간이 그만큼 뒤로 밀린다 — 고객에게 유리한 방향이라
 *    그대로 둔다. 반대로 앞당겨 적으면 고객 권리를 줄이게 되므로 절대 소급하지 않는다.
 */
export async function markTransferByOps(bookingId: string): Promise<ConfirmResult> {
  const admin = createAdminClient();
  const { data: moved } = await admin
    .from("bookings")
    .update({ transfer_marked_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("status", "accepted")
    .is("transfer_marked_at", null) // 멱등 — 이미 표시됐으면 건드리지 않는다
    .select("id, amount_krw");
  if (!moved || moved.length === 0) return { ok: false, reason: "bad_state" };

  await ensureTransferRecord(bookingId, moved[0].amount_krw ?? 0);
  return { ok: true };
}

// ─────────────────────────────────────────────
// 환불 (docs/32)
// ─────────────────────────────────────────────

/** 환불 견적 — 판정만 하고 아무것도 바꾸지 않는다 (어드민 화면이 먼저 보여주는 값) */
export async function quoteRefund(
  bookingId: string,
  override?: RefundOverride | null,
  opts: { manualRefundKrw?: number | null } = {}
): Promise<(RefundQuote & { amountKrw: number }) | null> {
  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select(
      "id, status, amount_krw, travel_fee_krw, fee_snapshot, shoot_at, shoot_date, transfer_marked_at, late_booking_consent_at, refund_due_at, photographer_id"
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return null;

  const fee = await feeForBooking(admin, b);

  const quote = refundQuote({
    shootAt: b.shoot_at,
    shootDate: b.shoot_date,
    transferMarkedAt: b.transfer_marked_at,
    // 임박 예약의 위약금 별도 동의 — 없으면 청약철회가 이긴다 (취소환불 3조 2항)
    lateBookingConsentAt: b.late_booking_consent_at,
    // 취소 시점 = 고객이 취소를 신청한 시각 (5조 3항). 어드민이 늦게 봐도 구간이 밀리지 않는다
    requestedAt: b.refund_due_at,
    amountKrw: b.amount_krw ?? 0,
    travelFeeKrw: b.travel_fee_krw ?? 0,
    feeKrw: fee.feeKrw,
    feeRate: feeRateOf(fee),
    override,
    manualRefundKrw: opts.manualRefundKrw,
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
  opts: { override?: RefundOverride | null; note?: string; manualRefundKrw?: number | null } = {}
): Promise<ConfirmResult> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const quote = await quoteRefund(bookingId, opts.override, { manualRefundKrw: opts.manualRefundKrw });
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
      // 판정 결과를 숫자로 남긴다 — 정산 내역서와 위약금 배분이 여기서 읽는다
      refund_krw: quote.refundKrw,
      penalty_krw: quote.penaltyKrw,
      penalty_photographer_krw: quote.penaltyPhotographerKrw,
      penalty_company_krw: quote.penaltyCompanyKrw,
      fee_claim_krw: quote.feeClaimKrw,
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

  // 수수료 원장 — 판정에 따라 셋 중 하나다 (취소환불 13조).
  //  · 위약금 구간: 정상 수수료 대신 위약금의 사매 몫. 사매가 보관 중인 돈에서 갖는다 → paid
  //  · 위약금 없음(0%·청약철회·불가항력): 누구에게도 수수료 없음 → waived
  //  · 작가 귀책: 수수료 상당액을 작가에게 청구 → accrued 로 남겨 공제 원장이 이어받는다
  if (quote.feeWaived) {
    if (quote.penaltyCompanyKrw > 0) {
      await admin
        .from("platform_fees")
        .update({ fee_krw: quote.penaltyCompanyKrw, status: "paid", paid_at: now })
        .eq("booking_id", bookingId)
        .in("status", ["accrued", "billed"]);
    } else {
      await waiveFee(admin, bookingId);
    }
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
      quote.penaltyKrw > 0
        ? `위약금 ₩${fmtKrw(quote.penaltyKrw)} 중 작가님 몫 ₩${fmtKrw(quote.penaltyPhotographerKrw)} 을 정산해드려요.`
        : quote.photographerNetKrw >= 0
          ? `정산 금액은 ₩${fmtKrw(quote.photographerNetKrw)} 이에요.`
          : `수수료 상당액 ₩${fmtKrw(-quote.photographerNetKrw)} 을 작가님께 청구해요.`,
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

// ── 작가 정산 내역 (studio/settlements) ──────────────────────────
//
// 알림톡 「정산 완료」 버튼이 이 화면으로 온다(notify-templates.ts). 그래서 여기는
// **작가가 받을 돈이 지금 어디까지 왔는지**만 보여주면 된다.
//
// 이전 화면은 리드(문의 해제) 모델이었다 — 작가가 리드마다 건당 수수료를 사매에 내던
// 구조라 "입금 대기 / 납부 완료" 를 보여줬다. 지금은 반대다. 고객이 사매에 내고,
// 사매가 수수료를 뗀 뒤 작가에게 보낸다. 돈의 방향이 뒤집혔으므로 화면도 다시 짰다.

export type SettlementStage =
  | "awaiting_transfer"  // 고객이 아직 입금하지 않음
  | "checking"           // 고객이 [입금 완료] 를 눌렀고 사매가 확인 중
  | "settling"           // 입금 확인됨 — 사매가 작가에게 보낼 차례
  | "settled"            // 사매가 보냄
  | "refunded";          // 환불되어 정산이 없어짐

export type SettlementRow = {
  bookingId: string;
  customerName: string;
  shootAt: string | null;
  shootDate: string | null;
  /** 고객이 낸 총액 (촬영비 + 출장비) */
  paidKrw: number;
  /** 사매 중개 수수료 */
  feeKrw: number;
  /** 작가 실수령 — 정산 전이면 예상액 */
  netKrw: number;
  stage: SettlementStage;
  /** 작가가 결과물 전달을 알린 시각 — 지급 기한의 기산점 (수수료정책 3조 2항) */
  deliveredAt: string | null;
  settledAt: string | null;
  ackAt: string | null;
  disputeAt: string | null;
};

/**
 * 로그인한 작가의 정산 내역. RLS 가 이 작가의 예약만 돌려준다.
 *
 * 고객 이름은 작가 시점에서 RLS 에 막혀 비어 오므로 admin 으로 **이름만** 보강한다
 * (lib/bookings.ts 의 fillBookingCustomerNames 와 같은 패턴 — 연락처는 보강하지 않는다).
 */
export async function listMySettlements(photographerId: string): Promise<SettlementRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, status, shoot_at, shoot_date, amount_krw, travel_fee_krw, user_id, " +
        "transfer_marked_at, delivered_at, settled_at, settlement_amount_krw, settlement_ack_at, settlement_dispute_at"
    )
    .eq("photographer_id", photographerId)
    .in("status", ["accepted", "paid", "shot", "delivered", "completed", "refunded"])
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  if (rows.length === 0) return [];

  const admin = createAdminClient();
  const bookingIds = rows.map((r) => r.id as string);
  const userIds = [...new Set(rows.map((r) => r.user_id as string))];

  const [{ data: fees }, { data: profiles }] = await Promise.all([
    admin.from("platform_fees").select("booking_id, fee_krw, status").in("booking_id", bookingIds),
    admin.from("profiles").select("id, display_name").in("id", userIds),
  ]);

  const feeByBooking = new Map(
    (fees ?? []).map((f) => [
      f.booking_id as string,
      // 면제된 수수료는 0 으로 본다 — 환불 건에서 작가가 물지 않는다.
      // 작가에게 빠지는 돈은 수수료 + 부가세다 (수수료정책 1조 "부가가치세 별도")
      (f.status as string) === "waived" ? 0 : feeWithVat({ feeKrw: f.fee_krw as number, vatKrw: vatOnFee(f.fee_krw as number) }),
    ])
  );
  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string | null]));

  return rows.map((r) => {
    const status = r.status as string;
    const paidKrw = (r.amount_krw as number | null) ?? 0;
    const feeKrw = feeByBooking.get(r.id as string) ?? 0;
    const settledAt = (r.settled_at as string | null) ?? null;

    // 정산이 끝났으면 그때 확정된 금액이 진실이다. 그 뒤 수수료 정책이나 사업자 유형이
    // 바뀌어도 흔들리면 안 된다 — 이미 통장에 들어간 금액이다.
    const settled = settledAt && r.settlement_amount_krw != null;
    const netKrw = settled
      ? (r.settlement_amount_krw as number)
      : Math.max(0, paidKrw - feeKrw);

    let stage: SettlementStage;
    if (status === "refunded") stage = "refunded";
    else if (settledAt) stage = "settled";
    else if (status === "accepted") stage = r.transfer_marked_at ? "checking" : "awaiting_transfer";
    else stage = "settling";

    return {
      bookingId: r.id as string,
      customerName: nameById.get(r.user_id as string) || "고객",
      shootAt: (r.shoot_at as string | null) ?? null,
      shootDate: (r.shoot_date as string | null) ?? null,
      paidKrw,
      feeKrw,
      netKrw,
      stage,
      deliveredAt: (r.delivered_at as string | null) ?? null,
      settledAt,
      ackAt: (r.settlement_ack_at as string | null) ?? null,
      disputeAt: (r.settlement_dispute_at as string | null) ?? null,
    };
  });
}

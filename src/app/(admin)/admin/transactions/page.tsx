import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/ui";
import { CalendarIcon } from "@/components/user/icons";
import {
  clearTransactions,
  deleteBookingsSelected,
  adminConfirmTransfer,
  adminMarkSettled,
  adminMarkDepositAndConfirm,
  adminConfirmExtra,
  adminRefundExtra,
  adminSettleExtra,
} from "./actions";
import { cn } from "@/lib/cn";
import { DeleteModeProvider, DeleteModeToolbar } from "@/components/admin/DeleteMode";
import { AdminBookings, type BookingRow } from "./AdminBookings";
import { AdminCancelButton } from "./AdminCancelButton";
import { feeRateOf, feeSpecFromRow, feeSpecLabel, feeWithVat, readFeeSnapshot, resolveFee } from "@/lib/platform-fee";
import { refundQuote, refundSlaOverdue } from "@/lib/refund";
import { settlementSla } from "@/lib/settlement-sla";
import { readStoredFieldValues } from "@/lib/booking-fields";
import { listExtrasForAdmin } from "@/lib/extras-admin";
import { EXTRA_KIND_LABEL, extraStatusLabel } from "@/lib/extras";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("ko-KR");
const PAID_BOOKING = ["paid", "shot", "delivered", "completed"]; // 돈이 오간 거래
const IN_PROGRESS = ["requested", "accepted", "paid", "shot", "delivered"];

type DbBooking = {
  id: string;
  status: string;
  amount_krw: number | null;
  shoot_date: string | null;
  fee_snapshot: unknown;
  refunded_at: string | null;
  refund_paid_at: string | null;
  refund_reason: string | null;
  late_booking_consent_at: string | null;
  contact_delivered_at: string | null;
  refund_due_at: string | null;
  shoot_at: string | null;
  created_at: string;
  accepted_at: string | null;
  requested_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  location_text: string | null;
  travel_fee_krw: number;
  memo: string | null;
  custom_fields: unknown;
  proposed_by_photographer: boolean;
  photographer_id: string;
  transfer_marked_at: string | null;
  settled_at: string | null;
  delivered_at: string | null;
  delivery_due_at: string | null;
  settlement_amount_krw: number | null;
  settlement_ack_at: string | null;
  settlement_dispute_at: string | null;
  package_snapshot: { name?: string } | null;
  user: { display_name: string | null } | { display_name: string | null }[] | null;
  photographer: { display_name: string | null } | { display_name: string | null }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

// 거래 모니터링 + 삭제 모드(선택/전체 삭제). 가드는 (admin)/layout.
export default async function AdminTransactionsPage() {
  const admin = createAdminClient();

  const { data: bData } = await admin
    .from("bookings")
    .select(
      "id, status, amount_krw, shoot_at, shoot_date, fee_snapshot, refunded_at, refund_paid_at, refund_reason, late_booking_consent_at, contact_delivered_at, refund_due_at, created_at, accepted_at, requested_at, paid_at, cancelled_at, cancel_reason, location_text, travel_fee_krw, memo, custom_fields, proposed_by_photographer, photographer_id, package_snapshot, transfer_marked_at, settled_at, delivered_at, delivery_due_at, settlement_amount_krw, settlement_ack_at, settlement_dispute_at, user:profiles!bookings_user_id_fkey(display_name), photographer:photographers(display_name)"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  const raw = (bData ?? []) as DbBooking[];

  // 사매 매출 = 수수료 원장. 예약 수 × 6,000 으로 계산하지 않는다 —
  // 환불로 면제(waived)된 건이 있고, 수수료가 바뀌면 과거 건은 옛 금액이어야 한다.
  const { data: feeData } = await admin
    .from("platform_fees")
    .select("fee_krw, status, accrued_at");
  const fees = (feeData ?? []) as { fee_krw: number; status: string; accrued_at: string }[];
  const earned = fees
    .filter((f) => f.status !== "waived")
    .reduce((sum, f) => sum + (f.fee_krw ?? 0), 0);
  const monthKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }).slice(0, 7);
  const earnedThisMonth = fees
    .filter((f) => f.status !== "waived" && f.accrued_at?.slice(0, 7) === monthKey)
    .reduce((sum, f) => sum + (f.fee_krw ?? 0), 0);


  // 환불 신청이 열려 있는 예약 — 작가 합의 전에는 [환불] 을 잠근다.
  // 환불 계좌도 여기서 같이 가져온다. 접수함에만 있으면 두 화면을 오가야 한다.
  const { data: reqRows } = await admin
    .from("support_requests")
    .select("booking_id, photographer_ack_at, photographer_ack_note, refund_account, created_at")
    .eq("kind", "refund")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  type ReqRow = {
    booking_id: string | null;
    photographer_ack_at: string | null;
    photographer_ack_note: string | null;
    refund_account: { bank?: string; number?: string; holder?: string } | null;
  };
  const refundReqByBooking = new Map<string, ReqRow>();
  for (const r of (reqRows ?? []) as ReqRow[]) {
    if (r.booking_id && !refundReqByBooking.has(r.booking_id)) refundReqByBooking.set(r.booking_id, r);
  }

  // 예약 → 대화 매핑. 어드민이 "이 건이 어떤 대화에서 나왔나" 를 바로 열어볼 수 있어야
  // 금액 불일치·특이사항 판단이 된다 (채팅을 안 보고 확정하면 사고가 난다).
  const { data: convData } = await admin
    .from("messages")
    .select("booking_id, conversation_id")
    .in("booking_id", raw.map((b) => b.id).slice(0, 500));
  const convByBooking = new Map<string, string>();
  for (const m of (convData ?? []) as { booking_id: string | null; conversation_id: string }[]) {
    if (m.booking_id && !convByBooking.has(m.booking_id)) convByBooking.set(m.booking_id, m.conversation_id);
  }
  // 작가별 수수료 설정 — 스냅샷이 없는 옛 예약의 폴백 계산에 쓴다
  const { data: phRows } = await admin
    .from("photographers")
    .select("id, fee_mode, fee_amount_krw, fee_rate");
  const feeSpecById = new Map<string, ReturnType<typeof feeSpecFromRow>>();
  for (const p of (phRows ?? []) as {
    id: string;
    fee_mode: string | null;
    fee_amount_krw: number | null;
    fee_rate: number | null;
  }[]) {
    feeSpecById.set(p.id, feeSpecFromRow(p));
  }

  // 추가 결제 큐 — 입금 확인 대기(수락 + 입금 알림), 환불 가능(촬영 후·전달 전), 정산 대기(촬영 후·전달됨)
  const extrasAll = await listExtrasForAdmin();
  const extrasToConfirm = extrasAll.filter((e) => e.status === "accepted" && e.transfer_marked_at);
  const extrasToSettle = extrasAll.filter((e) => e.kind === "post_shoot" && e.status === "paid" && e.delivered_at && !e.settled_at);
  const extrasRefundable = extrasAll.filter((e) => e.kind === "post_shoot" && e.status === "paid" && !e.delivered_at);

  const gmv = raw.filter((b) => PAID_BOOKING.includes(b.status)).reduce((s, b) => s + (b.amount_krw ?? 0), 0);
  const inProgress = raw.filter((b) => IN_PROGRESS.includes(b.status)).length;

  // 에스크로 운영 큐
  //   ① 입금 확인 대기 — 고객이 [입금 완료]를 알림. 확인만 한다(accepted → paid).
  //   ② 정산 대기 — 결과물 전달이 끝난 건. 정산은 전달 뒤에만 한다(작가약관 13조 1항).
  //      촬영 전 건은 여기 오지 않는다.
  //   ③ 입금 대기 — 수락만 해놓고 아무 소식 없는 건
  const awaitingConfirm = raw.filter((b) => b.status === "accepted" && b.transfer_marked_at);
  // 정산 대기 — 전달 알림으로부터 7영업일 안에 보내야 한다(작가약관 13조 2항).
  // 기한이 급한 건을 위로 올린다. 목록 순서가 곧 처리 순서가 된다.
  const awaitingSettle = raw
    .filter((b) => PAID_BOOKING.includes(b.status) && !!b.delivered_at && !b.settled_at && !b.refunded_at)
    .map((b) => ({ b, sla: settlementSla(b.delivered_at, b.settled_at) }))
    .sort((x, y) => (x.sla?.daysLeft ?? 99) - (y.sla?.daysLeft ?? 99));
  const awaitingDeposit = raw.filter((b) => b.status === "accepted" && !b.transfer_marked_at);

  const bookings: BookingRow[] = raw.map((b) => ({
    id: b.id,
    status: b.status,
    amount_krw: b.amount_krw,
    travel_fee_krw: b.travel_fee_krw ?? 0,
    shoot_at: b.shoot_at,
    location_text: b.location_text,
    memo: b.memo,
    customFields: readStoredFieldValues(b.custom_fields),
    packageName: b.package_snapshot?.name ?? null,
    userName: one(b.user)?.display_name ?? null,
    photographerName: one(b.photographer)?.display_name ?? null,
    proposedByPhotographer: b.proposed_by_photographer,
    requested_at: b.requested_at ?? b.created_at,
    accepted_at: b.accepted_at,
    transfer_marked_at: b.transfer_marked_at,
    paid_at: b.paid_at,
    settled_at: b.settled_at,
    delivered_at: b.delivered_at,
    delivery_due_at: b.delivery_due_at,
    settlement_amount_krw: b.settlement_amount_krw,
    cancelled_at: b.cancelled_at,
    cancel_reason: b.cancel_reason,
    conversationId: convByBooking.get(b.id) ?? null,
    refunded_at: b.refunded_at,
    refund_paid_at: b.refund_paid_at,
    refund_reason: b.refund_reason,
    refundDueAt: b.refund_due_at,
    // 3영업일을 넘긴 환불 요청 — 넘기면 연 15% 지연이자가 법정 의무다 (docs/32 §6-7)
    refundOverdue: !b.refunded_at && refundSlaOverdue(b.refund_due_at),
    // 정산 기한 — 전달 알림으로부터 7영업일 (작가약관 13조 2항)
    settlementSla: (() => {
      const sla = settlementSla(b.delivered_at, b.settled_at);
      return sla ? { label: sla.label, overdue: sla.overdue, soon: sla.soon } : null;
    })(),
    ...(() => {
      // 수수료: 스냅샷이 우선, 없으면 현재 설정으로 계산 (0101 이전 예약). 기준은 촬영 대금 전체
      const fee =
        readFeeSnapshot(b.fee_snapshot) ??
        resolveFee(feeSpecById.get(b.photographer_id) ?? null, b.amount_krw ?? 0);
      // 지금 환불하면 얼마인가 — 운영이 버튼을 누르기 전에 보는 값 (판정은 lib/refund.ts).
      // 취소 시점은 고객이 신청한 시각(refund_due_at)이다 — 운영이 늦게 봐도 구간이 밀리지 않는다.
      const quote = refundQuote({
        shootAt: b.shoot_at,
        shootDate: b.shoot_date,
        transferMarkedAt: b.transfer_marked_at,
        lateBookingConsentAt: b.late_booking_consent_at,
        requestedAt: b.refund_due_at,
        amountKrw: b.amount_krw ?? 0,
        travelFeeKrw: b.travel_fee_krw ?? 0,
        feeKrw: fee.feeKrw,
        feeRate: feeRateOf(fee),
      });
      // 작가에게 실제로 보낼 금액. 화면에서 대충 빼서 보여주면 안 된다 —
      // 운영자는 이 숫자를 보고 은행 앱에 옮겨 적는다. markSettlementPaid 와 같은 식이어야 한다.
      const payoutKrw = Math.max(0, (b.amount_krw ?? 0) - feeWithVat(fee));
      return {
        feeKrw: fee.feeKrw,
        feeLabel: feeSpecLabel(fee),
        feeRate: feeRateOf(fee),
        vatKrw: fee.vatKrw,
        payoutKrw,
        refund: quote,
        // 고객이 낸 환불 신청이 열려 있는가 / 작가와 합의했는가
        refundRequested: refundReqByBooking.has(b.id),
        photographerAckAt: refundReqByBooking.get(b.id)?.photographer_ack_at ?? null,
        refundAccount: refundReqByBooking.get(b.id)?.refund_account ?? null,
      };
    })(),
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
     <DeleteModeProvider>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold">거래·정산</h1>
          <p className="mt-1 text-body-sm text-muted">예약 거래 흐름이에요.</p>
        </div>
        <DeleteModeToolbar
          clearAction={clearTransactions}
          deleteSelectedAction={deleteBookingsSelected}
          allIds={bookings.map((b) => b.id)}
          clearWarning="거래·결제·수수료가 모두 삭제돼요. 되돌릴 수 없어요(백업은 보관)."
          entityLabel="건"
        />
      </div>

      {/* 정산 대기 — 결과물 전달이 끝난 건. 정산은 전달 뒤에만 한다(작가약관 13조 1항).
          사매가 수수료·부가세를 뗀 금액을 작가 계좌로 보낸 뒤 여기서 마킹한다. */}
      {awaitingSettle.length > 0 && (
        <section className="mt-5 rounded-2xl bg-surface p-4 ring-1 ring-line">
          <h2 className="text-body-sm font-semibold text-fg">
            📤 정산 대기 <span className="text-brand">{awaitingSettle.length}</span>
            {awaitingSettle.some((x) => x.sla?.overdue) && (
              <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-caption font-semibold text-danger">
                기한 초과 {awaitingSettle.filter((x) => x.sla?.overdue).length}
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-caption text-muted">
            결과물 전달이 끝난 건이에요. 수수료·부가세를 뺀 금액을 작가에게 보낸 뒤
            마킹하세요. <b className="text-fg">전달 알림으로부터 7영업일</b> 안에 보내야 합니다.
          </p>
          <ul className="mt-2 space-y-2">
            {awaitingSettle.map(({ b, sla }) => (
              <li
                key={b.id}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-xl px-3 py-2",
                  sla?.overdue ? "bg-danger/10 ring-1 ring-danger/30" : "bg-surface-2"
                )}
              >
                <div className="min-w-0 text-caption">
                  <p className="font-semibold text-fg">
                    {one(b.photographer)?.display_name ?? "작가"}
                    {/* 기한이 안 보이면 지킬 수가 없다 — 환불 3영업일과 같은 방식 */}
                    {sla && (
                      <span
                        className={cn(
                          "ml-2 font-medium",
                          sla.overdue ? "text-danger" : sla.soon ? "text-warning" : "text-faint"
                        )}
                      >
                        {sla.label}
                      </span>
                    )}
                  </p>
                  <p className="text-muted">
                    입금액 ₩{fmt.format(b.amount_krw ?? 0)}{" "}
                    <span className="text-faint">(정산액은 아래 상세에서 확인)</span>
                  </p>
                </div>
                <form action={adminMarkSettled}>
                  <input type="hidden" name="id" value={b.id} />
                  <button className="cursor-pointer rounded-lg border border-line-strong px-3 py-1.5 text-caption font-semibold text-fg hover:bg-fg/[0.04]">
                    정산 완료
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 추가 결제 — 회원약관 8조. 촬영 전 추가금은 확인 즉시 예약에 합산되고, 촬영 후 추가금은 전달 후 따로 정산한다 */}
      {(extrasToConfirm.length > 0 || extrasToSettle.length > 0 || extrasRefundable.length > 0) && (
        <section className="mt-5 rounded-2xl bg-surface p-4 ring-1 ring-line">
          <h2 className="text-body-sm font-semibold text-fg">
            ➕ 추가 결제{" "}
            <span className="text-brand">{extrasToConfirm.length + extrasToSettle.length + extrasRefundable.length}</span>
          </h2>
          <ul className="mt-2 space-y-2">
            {[...extrasToConfirm, ...extrasRefundable, ...extrasToSettle].map((e) => {
              const canConfirm = e.status === "accepted" && !!e.transfer_marked_at;
              const canSettle = e.kind === "post_shoot" && e.status === "paid" && !!e.delivered_at && !e.settled_at;
              const canRefund = e.kind === "post_shoot" && e.status === "paid" && !e.delivered_at;
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2">
                  <div className="min-w-0 text-caption">
                    <p className="font-semibold text-fg">
                      {e.title} · ₩{fmt.format(e.amount_krw)}{" "}
                      <span className="font-normal text-faint">
                        {EXTRA_KIND_LABEL[e.kind]} · {extraStatusLabel(e)}
                      </span>
                    </p>
                    <p className="text-muted">
                      예약 <span className="font-mono">{e.booking_id.slice(0, 8)}</span>
                      {e.kind === "pre_shoot" && canConfirm && " · 확인하면 예약 총액에 합산돼요"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {canConfirm && (
                      <form action={adminConfirmExtra}>
                        <input type="hidden" name="id" value={e.id} />
                        <button className="cursor-pointer rounded-lg bg-fg px-3 py-1.5 text-caption font-semibold text-bg hover:opacity-90">입금 확인</button>
                      </form>
                    )}
                    {canRefund && (
                      <form action={adminRefundExtra}>
                        <input type="hidden" name="id" value={e.id} />
                        <button className="cursor-pointer rounded-lg border border-line-strong px-3 py-1.5 text-caption font-medium text-fg hover:bg-fg/[0.04]">전액 환불</button>
                      </form>
                    )}
                    {canSettle && (
                      <form action={adminSettleExtra}>
                        <input type="hidden" name="id" value={e.id} />
                        <button className="cursor-pointer rounded-lg border border-line-strong px-3 py-1.5 text-caption font-semibold text-fg hover:bg-fg/[0.04]">정산 완료</button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 입금 대기 — 수락 후 아무 소식 없는 건. 며칠째 그대로면 운영이 연락하거나 취소한다 */}
      {awaitingDeposit.length > 0 && (
        <section className="mt-5 rounded-2xl bg-surface p-4 ring-1 ring-line">
          <h2 className="text-body-sm font-semibold text-fg">
            ⏳ 입금 대기 <span className="text-brand-ink">{awaitingDeposit.length}</span>
          </h2>
          <p className="mt-0.5 text-caption text-muted">
            수락됐지만 고객이 아직 입금 완료를 알리지 않았어요. 오래 멈춰 있으면 연락하거나 취소하세요.
          </p>
          <ul className="mt-2 space-y-2">
            {awaitingDeposit.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2"
              >
                <div className="min-w-0 text-caption">
                  <p className="font-semibold text-fg">
                    {one(b.user)?.display_name ?? "고객"} → {one(b.photographer)?.display_name ?? "작가"}
                  </p>
                  <p className="text-muted">
                    ₩{fmt.format(b.amount_krw ?? 0)}
                    {b.accepted_at && ` · 수락 ${new Date(b.accepted_at).toLocaleDateString("ko-KR")}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {/* 통장에 돈은 들어왔는데 고객이 버튼을 안 누른 건 — 운영이 대신 확인한다 */}
                  <form action={adminMarkDepositAndConfirm}>
                    <input type="hidden" name="id" value={b.id} />
                    <button className="cursor-pointer rounded-lg bg-fg px-3 py-1.5 text-caption font-semibold text-bg hover:opacity-90">
                      입금 확인
                    </button>
                  </form>
                  <AdminCancelButton
                    bookingId={b.id}
                    label={`${one(b.user)?.display_name ?? "고객"} → ${one(b.photographer)?.display_name ?? "작가"} · ₩${fmt.format(b.amount_krw ?? 0)}`}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── 입금 확인 대기 — 확인만 한다. 정산은 결과물 전달 뒤 정산 대기 큐에서 ── */}
      {awaitingConfirm.length > 0 && (
        <div className="mt-5">
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="text-body-sm font-semibold text-fg">
              💰 입금 확인 대기 <span className="text-brand-ink">{awaitingConfirm.length}</span>
            </h2>
            <p className="mt-0.5 text-caption text-muted">
              통장에 들어온 걸 확인하고 누르세요. 정산은 결과물 전달이 끝난 뒤 따로 해요.
            </p>
            <ul className="mt-2 space-y-2">
              {awaitingConfirm.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2">
                  <div className="min-w-0 text-caption">
                    <p className="font-semibold text-fg">
                      {one(b.user)?.display_name ?? "고객"} → {one(b.photographer)?.display_name ?? "작가"}
                    </p>
                    <p className="text-muted">₩{fmt.format(b.amount_krw ?? 0)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <form action={adminConfirmTransfer}>
                      <input type="hidden" name="id" value={b.id} />
                      <button className="cursor-pointer rounded-lg bg-fg px-3 py-1.5 text-caption font-semibold text-bg hover:opacity-90">
                        입금 확인
                      </button>
                    </form>
                    <AdminCancelButton
                      bookingId={b.id}
                      label={`${one(b.user)?.display_name ?? "고객"} → ${one(b.photographer)?.display_name ?? "작가"} · ₩${fmt.format(b.amount_krw ?? 0)}`}
                    />
                  </div>
                </li>
              ))}
              {awaitingConfirm.length === 0 && <li className="text-caption text-faint">없음</li>}
            </ul>
          </section>

        </div>
      )}

      {/* 요약 — 들어온 돈 / 우리 몫 / 진행 중 */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="총 거래액" value={`₩${fmt.format(gmv)}`} />
        <SummaryCard
          label="사매 매출 (수수료)"
          value={`₩${fmt.format(earned)}`}
          sub={`이번 달 ₩${fmt.format(earnedThisMonth)}`}
        />
        <SummaryCard label="진행 중 거래" value={`${inProgress}건`} />
      </div>

      {bookings.length === 0 ? (
        <EmptyState className="mt-6" icon={<CalendarIcon className="h-7 w-7" />} title="거래가 없어요" />
      ) : (
        <AdminBookings bookings={bookings} />
      )}
     </DeleteModeProvider>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={cn("rounded-2xl border p-4", accent ? "border-brand/30 bg-brand/[0.04]" : "border-line bg-surface")}>
      <p className={cn("text-h2 font-semibold tabular-nums", accent ? "text-brand-ink" : "text-fg")}>{value}</p>
      <p className="mt-0.5 text-caption text-muted">{label}</p>
      {sub && <p className="mt-0.5 text-caption tabular-nums text-faint">{sub}</p>}
    </div>
  );
}

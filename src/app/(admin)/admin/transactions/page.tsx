import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/ui";
import { CalendarIcon } from "@/components/user/icons";
import { clearTransactions, deleteBookingsSelected, adminSettleNow, adminMarkSettled } from "./actions";
import { cn } from "@/lib/cn";
import { DeleteModeProvider, DeleteModeToolbar } from "@/components/admin/DeleteMode";
import { AdminBookings, type BookingRow } from "./AdminBookings";
import { AdminCancelButton } from "./AdminCancelButton";
import { feeSpecFromRow, feeSpecLabel, readFeeSnapshot, resolveFee } from "@/lib/platform-fee";
import { refundQuote } from "@/lib/refund";
import { readStoredFieldValues } from "@/lib/booking-fields";

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
  refund_reason: string | null;
  late_booking_consent_at: string | null;
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
      "id, status, amount_krw, shoot_at, shoot_date, fee_snapshot, refunded_at, refund_reason, late_booking_consent_at, created_at, accepted_at, requested_at, paid_at, cancelled_at, cancel_reason, location_text, travel_fee_krw, memo, custom_fields, proposed_by_photographer, photographer_id, package_snapshot, transfer_marked_at, settled_at, settlement_amount_krw, settlement_ack_at, settlement_dispute_at, user:profiles!bookings_user_id_fkey(display_name), photographer:photographers(display_name)"
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

  const gmv = raw.filter((b) => PAID_BOOKING.includes(b.status)).reduce((s, b) => s + (b.amount_krw ?? 0), 0);
  const inProgress = raw.filter((b) => IN_PROGRESS.includes(b.status)).length;

  // 에스크로 운영 큐
  //   ① 입금 확인 대기 — 고객이 [입금 완료]를 알림. 확인과 정산을 한 번에 처리한다.
  //   ② 정산 누락 — ①에서 확인은 됐는데 정산 기록이 안 남은 건.
  //      정상 흐름에서는 절대 안 생긴다(확인·정산이 한 동작이라). 생기면 사고라서 경고로 띄운다.
  //   ③ 입금 대기 — 수락만 해놓고 아무 소식 없는 건
  const awaitingConfirm = raw.filter((b) => b.status === "accepted" && b.transfer_marked_at);
  const awaitingSettle = raw.filter((b) => PAID_BOOKING.includes(b.status) && !b.settled_at);
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
    settlement_amount_krw: b.settlement_amount_krw,
    cancelled_at: b.cancelled_at,
    cancel_reason: b.cancel_reason,
    conversationId: convByBooking.get(b.id) ?? null,
    refunded_at: b.refunded_at,
    refund_reason: b.refund_reason,
    ...(() => {
      // 수수료: 제안 시점 스냅샷이 우선, 없으면 현재 설정으로 계산 (0101 이전 예약)
      const shootFee = Math.max(0, (b.amount_krw ?? 0) - (b.travel_fee_krw ?? 0));
      const fee =
        readFeeSnapshot(b.fee_snapshot) ??
        resolveFee(feeSpecById.get(b.photographer_id) ?? null, shootFee);
      // 지금 환불하면 얼마인가 — 운영이 버튼을 누르기 전에 보는 값 (판정은 lib/refund.ts)
      const quote = refundQuote({
        shootAt: b.shoot_at,
        shootDate: b.shoot_date,
        transferMarkedAt: b.transfer_marked_at,
        lateBookingConsentAt: b.late_booking_consent_at,
        amountKrw: b.amount_krw ?? 0,
        travelFeeKrw: b.travel_fee_krw ?? 0,
        feeKrw: fee.feeKrw,
      });
      return { feeKrw: fee.feeKrw, feeLabel: feeSpecLabel(fee), refund: quote };
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

      {/* 정산 누락 — 확인은 됐는데 정산 기록이 없는 건.
          [확인·정산] 이 한 동작이라 정상 흐름에선 안 생긴다. 뜨면 중간에 끊긴 것이다. */}
      {awaitingSettle.length > 0 && (
        <section className="mt-5 rounded-2xl bg-warning-soft p-4 ring-1 ring-warning/30">
          <h2 className="text-body-sm font-semibold text-warning">
            ⚠️ 정산 누락 {awaitingSettle.length}건
          </h2>
          <p className="mt-0.5 text-caption text-warning/80">
            입금 확인은 됐는데 정산 기록이 남지 않았어요. 작가 송금 여부를 확인하고 마킹해주세요.
          </p>
          <ul className="mt-2 space-y-2">
            {awaitingSettle.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2"
              >
                <div className="min-w-0 text-caption">
                  <p className="font-semibold text-fg">{one(b.photographer)?.display_name ?? "작가"}</p>
                  <p className="text-muted">
                    입금액 ₩{fmt.format(b.amount_krw ?? 0)}{" "}
                    <span className="text-faint">(수수료는 아래 상세에서 확인)</span>
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

      {/* 입금 대기 — 수락 후 아무 소식 없는 건. 며칠째 그대로면 운영이 연락하거나 취소한다 */}
      {awaitingDeposit.length > 0 && (
        <section className="mt-5 rounded-2xl bg-surface p-4 ring-1 ring-line">
          <h2 className="text-body-sm font-semibold text-fg">
            ⏳ 입금 대기 <span className="text-brand">{awaitingDeposit.length}</span>
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
                <AdminCancelButton
                  bookingId={b.id}
                  label={`${one(b.user)?.display_name ?? "고객"} → ${one(b.photographer)?.display_name ?? "작가"} · ₩${fmt.format(b.amount_krw ?? 0)}`}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── 에스크로 운영 큐 — 입금 확인이 곧 정산이라 단계가 하나다 ── */}
      {awaitingConfirm.length > 0 && (
        <div className="mt-5">
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="text-body-sm font-semibold text-fg">
              💰 입금 확인 대기 <span className="text-brand">{awaitingConfirm.length}</span>
            </h2>
            <p className="mt-0.5 text-caption text-muted">
              입금 확인 + 수수료 차감 정산까지 한 번에 처리돼요 (작가 송금은 직접)
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
                    <form action={adminSettleNow}>
                      <input type="hidden" name="id" value={b.id} />
                      <button className="cursor-pointer rounded-lg bg-fg px-3 py-1.5 text-caption font-semibold text-bg hover:opacity-90">
                        확인 · 정산
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
      <p className={cn("text-h2 font-semibold tabular-nums", accent ? "text-brand" : "text-fg")}>{value}</p>
      <p className="mt-0.5 text-caption text-muted">{label}</p>
      {sub && <p className="mt-0.5 text-caption tabular-nums text-faint">{sub}</p>}
    </div>
  );
}

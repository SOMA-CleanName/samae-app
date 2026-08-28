import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/ui";
import { CalendarIcon } from "@/components/user/icons";
import { clearTransactions, deleteBookingsSelected, adminConfirmTransfer, adminMarkSettled } from "./actions";
import { cn } from "@/lib/cn";
import { DeleteModeProvider, DeleteModeToolbar } from "@/components/admin/DeleteMode";
import { AdminBookings, type BookingRow } from "./AdminBookings";
import { AdminCancelButton } from "./AdminCancelButton";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("ko-KR");
const PAID_BOOKING = ["paid", "shot", "delivered", "completed"]; // 돈이 오간 거래
const IN_PROGRESS = ["requested", "accepted", "paid", "shot", "delivered"];

type DbBooking = {
  id: string;
  status: string;
  amount_krw: number | null;
  shoot_at: string | null;
  created_at: string;
  accepted_at: string | null;
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
      "id, status, amount_krw, shoot_at, created_at, accepted_at, package_snapshot, transfer_marked_at, settled_at, settlement_amount_krw, settlement_ack_at, settlement_dispute_at, user:profiles!bookings_user_id_fkey(display_name), photographer:photographers(display_name)"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  const raw = (bData ?? []) as DbBooking[];
  const gmv = raw.filter((b) => PAID_BOOKING.includes(b.status)).reduce((s, b) => s + (b.amount_krw ?? 0), 0);
  const inProgress = raw.filter((b) => IN_PROGRESS.includes(b.status)).length;

  // 에스크로 운영 큐 — ①입금 확인 대기(고객이 입금 완료 알림) ②정산 대기(확정됐지만 작가 미송금)
  // ③정산 미수령 확인 요청(작가가 [못 받았어요])
  const awaitingConfirm = raw.filter((b) => b.status === "accepted" && b.transfer_marked_at);
  // ④입금 대기 — 수락은 됐는데 고객이 아직 입금 완료를 알리지 않은 건.
  // 여태 어느 큐에도 안 떠서, 수락해놓고 그대로 멈춘 예약을 운영이 발견할 방법이 없었다.
  const awaitingDeposit = raw.filter((b) => b.status === "accepted" && !b.transfer_marked_at);
  const awaitingSettle = raw.filter(
    (b) => PAID_BOOKING.includes(b.status) && !b.settled_at
  );
  const settleDisputes = raw.filter(
    (b) => b.settled_at && b.settlement_dispute_at && !b.settlement_ack_at
  );

  const bookings: BookingRow[] = raw.map((b) => ({
    id: b.id,
    status: b.status,
    amount_krw: b.amount_krw,
    shoot_at: b.shoot_at,
    packageName: b.package_snapshot?.name ?? null,
    userName: one(b.user)?.display_name ?? null,
    photographerName: one(b.photographer)?.display_name ?? null,
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

      {/* 정산 미수령 확인 요청 — 작가가 [못 받았어요]를 눌렀다: 송금 내역 대조 후 회신 */}
      {settleDisputes.length > 0 && (
        <section className="mt-5 rounded-2xl bg-warning-soft p-4 ring-1 ring-warning/30">
          <h2 className="text-body-sm font-semibold text-warning">
            ⚠️ 정산 미수령 확인 요청 {settleDisputes.length}건
          </h2>
          <ul className="mt-2 space-y-1.5">
            {settleDisputes.map((b) => (
              <li key={b.id} className="text-caption text-fg">
                <b>{one(b.photographer)?.display_name ?? "작가"}</b> — 정산액 ₩
                {fmt.format(b.settlement_amount_krw ?? 0)} · 송금 마킹{" "}
                {b.settled_at?.slice(0, 10)} · 요청 {b.settlement_dispute_at?.slice(0, 10)}
                <span className="ml-1 text-muted">송금 내역 확인 후 작가에게 회신하세요.</span>
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

      {/* ── 에스크로 운영 큐 ── */}
      {(awaitingConfirm.length > 0 || awaitingSettle.length > 0) && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="text-body-sm font-semibold text-fg">
              💰 입금 확인 대기 <span className="text-brand">{awaitingConfirm.length}</span>
            </h2>
            <p className="mt-0.5 text-caption text-muted">사매 계좌 입금 확인 → 예약 확정</p>
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

          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="text-body-sm font-semibold text-fg">
              📤 작가 정산 대기 <span className="text-brand">{awaitingSettle.length}</span>
            </h2>
            <p className="mt-0.5 text-caption text-muted">수수료 차감 후 작가 계좌로 송금 → 완료 마킹</p>
            <ul className="mt-2 space-y-2">
              {awaitingSettle.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2">
                  <div className="min-w-0 text-caption">
                    <p className="font-semibold text-fg">{one(b.photographer)?.display_name ?? "작가"}</p>
                    <p className="text-muted">
                      송금액 ₩{fmt.format(Math.max(0, (b.amount_krw ?? 0) - 6000))}{" "}
                      <span className="text-faint">(수수료 6,000 차감)</span>
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
              {awaitingSettle.length === 0 && <li className="text-caption text-faint">없음</li>}
            </ul>
          </section>
        </div>
      )}

      {/* 요약 */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <SummaryCard label="총 거래액" value={`₩${fmt.format(gmv)}`} />
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

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-4", accent ? "border-brand/30 bg-brand/[0.04]" : "border-line bg-surface")}>
      <p className={cn("text-h2 font-semibold tabular-nums", accent ? "text-brand" : "text-fg")}>{value}</p>
      <p className="mt-0.5 text-caption text-muted">{label}</p>
    </div>
  );
}

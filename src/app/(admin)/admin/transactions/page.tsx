import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/ui";
import { CalendarIcon } from "@/components/user/icons";
import { clearTransactions, deleteBookingsSelected } from "./actions";
import { cn } from "@/lib/cn";
import { DeleteModeProvider, DeleteModeToolbar } from "@/components/admin/DeleteMode";
import { AdminBookings, type BookingRow } from "./AdminBookings";

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
      "id, status, amount_krw, shoot_at, created_at, package_snapshot, user:profiles!bookings_user_id_fkey(display_name), photographer:photographers(display_name)"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  const raw = (bData ?? []) as DbBooking[];
  const gmv = raw.filter((b) => PAID_BOOKING.includes(b.status)).reduce((s, b) => s + (b.amount_krw ?? 0), 0);
  const inProgress = raw.filter((b) => IN_PROGRESS.includes(b.status)).length;

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

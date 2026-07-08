import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge, EmptyState } from "@/components/ui";
import { CalendarIcon, WalletIcon } from "@/components/user/icons";
import { setSettlementStatus, clearTransactions } from "./actions";
import { cn } from "@/lib/cn";
import { PasswordReset } from "@/components/admin/PasswordReset";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("ko-KR");
const PAID_BOOKING = ["paid", "shot", "delivered", "completed"]; // 돈이 오간 거래

const BOOKING_STATUS: Record<string, { label: string; tone: "warning" | "info" | "success" | "neutral" | "danger" }> = {
  requested: { label: "요청", tone: "warning" },
  accepted: { label: "수락", tone: "info" },
  paid: { label: "결제", tone: "success" },
  shot: { label: "촬영", tone: "success" },
  delivered: { label: "전달", tone: "success" },
  completed: { label: "완료", tone: "success" },
  rejected: { label: "반려", tone: "neutral" },
  cancelled: { label: "취소", tone: "neutral" },
  refunded: { label: "환불", tone: "danger" },
};
const SETTLE_STATUS: Record<string, { label: string; tone: "warning" | "info" | "success" | "neutral" }> = {
  pending: { label: "대기", tone: "warning" },
  scheduled: { label: "예정", tone: "info" },
  paid: { label: "완료", tone: "success" },
  held: { label: "보류", tone: "neutral" },
};
const SETTLE_KEYS = Object.keys(SETTLE_STATUS);

type Booking = {
  id: string;
  status: string;
  amount_krw: number | null;
  shoot_at: string | null;
  created_at: string;
  package_snapshot: { name?: string } | null;
  user: { display_name: string | null } | { display_name: string | null }[] | null;
  photographer: { display_name: string | null } | { display_name: string | null }[] | null;
};
type Settlement = {
  id: string;
  gross_krw: number;
  fee_krw: number;
  net_krw: number;
  status: string;
  scheduled_at: string | null;
  paid_at: string | null;
  created_at: string;
  photographer: { display_name: string | null } | { display_name: string | null }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const day = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(iso))
    : "—";

// 거래·정산 모니터링. 가드는 (admin)/layout.
export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string }>;
}) {
  const view = (await searchParams)?.view === "settlements" ? "settlements" : "bookings";
  const admin = createAdminClient();

  const [{ data: bData }, { data: sData }] = await Promise.all([
    admin
      .from("bookings")
      .select(
        "id, status, amount_krw, shoot_at, created_at, package_snapshot, user:profiles!bookings_user_id_fkey(display_name), photographer:photographers(display_name)"
      )
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("settlements")
      .select("id, gross_krw, fee_krw, net_krw, status, scheduled_at, paid_at, created_at, photographer:photographers(display_name)")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const bookings = (bData ?? []) as Booking[];
  const settlements = (sData ?? []) as Settlement[];

  // 요약
  const gmv = bookings
    .filter((b) => PAID_BOOKING.includes(b.status))
    .reduce((s, b) => s + (b.amount_krw ?? 0), 0);
  const inProgress = bookings.filter((b) => ["requested", "accepted", "paid", "shot", "delivered"].includes(b.status)).length;
  const pendingPayout = settlements
    .filter((s) => s.status === "pending" || s.status === "scheduled")
    .reduce((s, x) => s + x.net_krw, 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold">거래·정산</h1>
          <p className="mt-1 text-body-sm text-muted">예약 거래 흐름과 작가 정산 현황이에요.</p>
        </div>
        <PasswordReset
          action={clearTransactions}
          label="거래·정산 초기화"
          count={bookings.length}
          warning="거래·결제·정산·수수료가 모두 삭제돼요. 되돌릴 수 없어요(백업은 보관)."
        />
      </div>

      {/* 요약 */}
      <div className="mt-5 grid grid-cols-3 gap-3">
        <SummaryCard label="총 거래액" value={`₩${fmt.format(gmv)}`} />
        <SummaryCard label="진행 중 거래" value={`${inProgress}건`} />
        <SummaryCard label="정산 대기액" value={`₩${fmt.format(pendingPayout)}`} accent={pendingPayout > 0} />
      </div>

      {/* 탭 */}
      <div className="mt-6 flex gap-1.5">
        <TabLink href="/admin/transactions" active={view === "bookings"} icon={<CalendarIcon className="h-4 w-4" />}>
          거래 {bookings.length}
        </TabLink>
        <TabLink href="/admin/transactions?view=settlements" active={view === "settlements"} icon={<WalletIcon className="h-4 w-4" />}>
          정산 {settlements.length}
        </TabLink>
      </div>

      {view === "bookings" ? (
        bookings.length === 0 ? (
          <EmptyState className="mt-6" icon={<CalendarIcon className="h-7 w-7" />} title="거래가 없어요" />
        ) : (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {bookings.map((b) => {
              const s = BOOKING_STATUS[b.status] ?? { label: b.status, tone: "neutral" as const };
              return (
                <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm font-semibold text-fg">
                      {b.package_snapshot?.name || "촬영"}
                    </p>
                    <p className="truncate text-caption text-faint">
                      {one(b.user)?.display_name ?? "고객"} → {one(b.photographer)?.display_name ?? "작가"} · 촬영 {day(b.shoot_at)}
                    </p>
                  </div>
                  <span className="shrink-0 text-body-sm font-semibold tabular-nums text-fg">
                    ₩{fmt.format(b.amount_krw ?? 0)}
                  </span>
                  <Badge tone={s.tone}>{s.label}</Badge>
                </li>
              );
            })}
          </ul>
        )
      ) : settlements.length === 0 ? (
        <EmptyState className="mt-6" icon={<WalletIcon className="h-7 w-7" />} title="정산 내역이 없어요" />
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {settlements.map((st) => {
            const s = SETTLE_STATUS[st.status] ?? { label: st.status, tone: "neutral" as const };
            return (
              <li key={st.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-body-sm font-semibold text-fg">
                    {one(st.photographer)?.display_name ?? "작가"}
                  </p>
                  <Badge tone={s.tone}>{s.label}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption">
                  <span><span className="text-faint">거래액</span> <span className="font-medium text-fg tabular-nums">₩{fmt.format(st.gross_krw)}</span></span>
                  <span><span className="text-faint">수수료</span> <span className="font-medium text-fg tabular-nums">₩{fmt.format(st.fee_krw)}</span></span>
                  <span><span className="text-faint">정산액</span> <span className="font-semibold text-fg tabular-nums">₩{fmt.format(st.net_krw)}</span></span>
                </div>
                <form action={setSettlementStatus} className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                  <input type="hidden" name="id" value={st.id} />
                  <span className="text-caption text-muted">정산 상태</span>
                  <select
                    name="status"
                    defaultValue={st.status}
                    className="rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-caption outline-none focus:border-fg/40"
                  >
                    {SETTLE_KEYS.map((k) => (
                      <option key={k} value={k}>{SETTLE_STATUS[k].label}</option>
                    ))}
                  </select>
                  <button className="cursor-pointer rounded-lg bg-fg px-3 py-1.5 text-caption font-semibold text-bg transition-opacity hover:opacity-90">
                    변경
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
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

function TabLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-caption font-medium transition-colors",
        active ? "border-fg bg-fg text-bg" : "border-line-strong text-muted hover:bg-fg/[0.04]"
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  listMyBookings,
  STATUS_LABEL,
  statusTone,
  fmtShootAt,
  type BookingRow,
  type BookingStatus,
} from "@/lib/bookings";

export const dynamic = "force-dynamic";

// 확정(작가 수락 이후) 예약 상태만 목록에 노출 — 요청중/거절/취소는 채팅방에서만 (R3)
const CONFIRMED_STATUSES: BookingStatus[] = [
  "accepted", "paid", "shot", "delivered", "completed", "refunded",
];
function onlyConfirmed(rows: BookingRow[]): BookingRow[] {
  return rows.filter((b) => CONFIRMED_STATUSES.includes(b.status));
}

// 예약 목록 (구매자/작가 통합) — 확정 예약만
export default async function BookingsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/bookings");

  const all = await listMyBookings();
  const asBuyer = onlyConfirmed(all.filter((b) => b.user_id === me.id));
  const asPhotographer = onlyConfirmed(
    all.filter((b) => me.photographer && b.photographer_id === me.photographer.id)
  );

  // 대기 중(요청됨) 제안 수 — 확정 목록엔 없지만 채팅에서 진행 중
  const pendingCount = all.filter(
    (b) =>
      b.status === "requested" &&
      (b.user_id === me.id || (me.photographer && b.photographer_id === me.photographer.id))
  ).length;

  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8 font-kr">
      <h1 className="text-2xl font-semibold">예약</h1>
      <p className="mt-1 text-sm text-fg/50">확정된 예약만 표시돼요. 요청·취소 내역은 채팅방에서 확인할 수 있어요.</p>

      {pendingCount > 0 && (
        <Link
          href="/chat"
          className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm hover:bg-amber-500/[0.1]"
        >
          <span className="text-amber-700">
            대기 중인 예약 제안 <strong>{pendingCount}건</strong>이 있어요.
          </span>
          <span className="shrink-0 text-xs text-amber-700/80">채팅에서 확인 →</span>
        </Link>
      )}

      {me.photographer && (
        <Section title="받은 예약" rows={asPhotographer} me={me.id} role="photographer" />
      )}
      <Section title="내 예약" rows={asBuyer} me={me.id} role="buyer" />
    </main>
  );
}

function Section({
  title,
  rows,
  role,
}: {
  title: string;
  rows: BookingRow[];
  me: string;
  role: "buyer" | "photographer";
}) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-medium text-fg/70">
        {title} {rows.length > 0 && <span className="text-fg/40">{rows.length}</span>}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-fg/45">아직 없어요.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((b) => (
            <li key={b.id}>
              <Link
                href={`/bookings/${b.id}`}
                className="block rounded-xl border border-fg/10 p-4 hover:border-fg/25"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {role === "buyer"
                      ? b.photographer?.display_name || "작가"
                      : b.user?.display_name || "고객"}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusTone(b.status)}`}>
                    {STATUS_LABEL[b.status]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-fg/55">
                  {b.package?.name ?? b.package_snapshot?.name ?? "패키지"} · {fmtShootAt(b.shoot_at)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

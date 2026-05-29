import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listMySettlements, SETTLEMENT_LABEL, FEE_RATE } from "@/lib/payments";

// 작가 정산 내역
export default async function SettlementsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/settlements");
  if (!me.photographer) redirect("/studio");

  const settlements = await listMySettlements();
  const fmt = new Intl.NumberFormat("ko-KR");

  // 합계 (정산 완료 기준 수령액)
  const paidTotal = settlements
    .filter((s) => s.status === "paid")
    .reduce((sum, s) => sum + s.net_krw, 0);
  const pendingTotal = settlements
    .filter((s) => s.status === "pending" || s.status === "scheduled")
    .reduce((sum, s) => sum + s.net_krw, 0);

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 font-kr">
      <Link href="/studio" className="text-sm text-fg/50 hover:text-fg">
        ← 스튜디오
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">정산 내역</h1>
      <p className="mt-1 text-xs text-fg/45">플랫폼 수수료 {Math.round(FEE_RATE * 100)}% 차감 후 수령액 기준</p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-fg/10 p-4">
          <p className="text-xs text-fg/50">정산 완료</p>
          <p className="mt-1 text-lg font-semibold text-emerald-700">₩{fmt.format(paidTotal)}</p>
        </div>
        <div className="rounded-xl border border-fg/10 p-4">
          <p className="text-xs text-fg/50">예정·보류</p>
          <p className="mt-1 text-lg font-semibold">₩{fmt.format(pendingTotal)}</p>
        </div>
      </div>

      {settlements.length === 0 ? (
        <p className="mt-6 rounded-xl border border-fg/10 p-6 text-sm text-fg/60">
          아직 정산 내역이 없어요.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {settlements.map((s) => (
            <li key={s.id}>
              <Link
                href={`/bookings/${s.booking_id}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-fg/10 px-4 py-3 text-sm hover:border-fg/25 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {s.booking?.user?.display_name || "고객"}
                  </span>
                  <span className="block text-xs text-fg/50">{SETTLEMENT_LABEL[s.status]}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold">₩{fmt.format(s.net_krw)}</span>
                  <span className="block text-xs text-fg/45">
                    결제 ₩{fmt.format(s.gross_krw)} · 수수료 ₩{fmt.format(s.fee_krw)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

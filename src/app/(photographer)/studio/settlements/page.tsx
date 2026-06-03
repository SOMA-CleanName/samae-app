import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listMyFees, FEE_LABEL, PLATFORM_FEE_KRW } from "@/lib/payments";

// 작가 수수료 내역 — 매칭 건당 플랫폼 수수료(작가 부담)를 누적·표시.
// 사용자→작가 촬영비는 직접 계좌이체이므로 플랫폼이 보관/정산하지 않는다.
export default async function FeesPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/settlements");
  if (!me.photographer) redirect("/studio");

  const fees = await listMyFees();
  const fmt = new Intl.NumberFormat("ko-KR");

  // 미납(발생·청구) vs 납부 완료 합계
  const dueTotal = fees
    .filter((f) => f.status === "accrued" || f.status === "billed")
    .reduce((sum, f) => sum + f.fee_krw, 0);
  const paidTotal = fees
    .filter((f) => f.status === "paid")
    .reduce((sum, f) => sum + f.fee_krw, 0);

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 font-kr">
      <Link href="/studio" className="text-sm text-fg/50 hover:text-fg">
        ← 스튜디오
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">수수료 내역</h1>
      <p className="mt-1 text-xs text-fg/45">
        매칭 건당 플랫폼 수수료 ₩{fmt.format(PLATFORM_FEE_KRW)} (작가 부담) · 월 단위 청구
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-fg/10 p-4">
          <p className="text-xs text-fg/50">미납 (청구 예정)</p>
          <p className="mt-1 text-lg font-semibold text-brand">₩{fmt.format(dueTotal)}</p>
        </div>
        <div className="rounded-xl border border-fg/10 p-4">
          <p className="text-xs text-fg/50">납부 완료</p>
          <p className="mt-1 text-lg font-semibold text-emerald-700">₩{fmt.format(paidTotal)}</p>
        </div>
      </div>

      {fees.length === 0 ? (
        <p className="mt-6 rounded-xl border border-fg/10 p-6 text-sm text-fg/60">
          아직 수수료 내역이 없어요. 입금이 확인된 예약부터 매칭 수수료가 발생합니다.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {fees.map((f) => (
            <li key={f.id}>
              <Link
                href={`/bookings/${f.booking_id}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-fg/10 px-4 py-3 text-sm hover:border-fg/25 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {f.booking?.user?.display_name || "고객"}
                  </span>
                  <span className="block text-xs text-fg/50">
                    {FEE_LABEL[f.status]}
                    {f.period ? ` · ${f.period}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span
                    className={`block font-semibold ${
                      f.status === "waived" ? "text-fg/40 line-through" : ""
                    }`}
                  >
                    ₩{fmt.format(f.fee_krw)}
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

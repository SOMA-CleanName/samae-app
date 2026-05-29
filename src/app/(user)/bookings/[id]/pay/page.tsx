import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBooking, fmtShootAt } from "@/lib/bookings";
import { ensurePendingPayment } from "@/lib/payments";
import { mockPayConfirm } from "@/app/actions/payments";

// Mock 결제 페이지 — 실 PG 연동 시 PG SDK 결제창으로 대체된다.
export default async function PayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=/bookings/${id}/pay`);

  const b = await getBooking(id);
  if (!b) notFound();
  if (b.user_id !== me.id) redirect(`/bookings/${id}`);
  if (b.status !== "accepted") redirect(`/bookings/${id}`);

  // 서버가 결제 금액을 생성·보관 (클라이언트 금액 신뢰 금지)
  await ensurePendingPayment(id, b.amount_krw ?? 0);
  const fmt = new Intl.NumberFormat("ko-KR");

  return (
    <main className="mx-auto max-w-lg px-4 sm:px-6 py-8 font-kr">
      <Link href={`/bookings/${id}`} className="text-sm text-fg/50 hover:text-fg">
        ← 예약 상세
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">결제</h1>

      <div className="mt-6 rounded-xl border border-fg/10 p-5 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-fg/50">패키지</span>
          <span className="text-right">{b.package?.name ?? b.package_snapshot?.name ?? "—"}</span>
        </div>
        <div className="mt-3 flex justify-between gap-4">
          <span className="text-fg/50">일시</span>
          <span className="text-right">{fmtShootAt(b.shoot_at)}</span>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-fg/10 pt-4">
          <span className="font-medium">결제 금액</span>
          <span className="text-lg font-semibold">₩{fmt.format(b.amount_krw ?? 0)}</span>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-700">
        🧪 테스트(Mock) 결제입니다. 실제 청구는 발생하지 않으며, 결제 확정 흐름(에스크로
        보류 → 전달 확인 → 정산)을 그대로 따릅니다.
      </div>

      <form action={mockPayConfirm} className="mt-6">
        <input type="hidden" name="bookingId" value={b.id} />
        <button className="w-full rounded-xl bg-fg py-3.5 text-sm font-semibold text-bg hover:opacity-90">
          ₩{fmt.format(b.amount_krw ?? 0)} 결제하기 (테스트)
        </button>
      </form>
      <p className="mt-3 text-center text-xs text-fg/45">
        결제 후 금액은 거래 완료까지 플랫폼이 보관(에스크로)합니다.
      </p>
    </main>
  );
}

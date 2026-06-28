import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBooking, fmtShootAt } from "@/lib/bookings";
import { refundBooking } from "@/app/actions/payments";

// 환불 안내·신청 — 결제 이후(paid/shot/delivered) 구매자(또는 운영자)가
// 자세한 정책을 읽고 환불을 신청한다. 실제 환불 송금은 작가가 직접 한다(오프플랫폼).
export default async function RefundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=/bookings/${id}/refund`);

  const b = await getBooking(id);
  if (!b) notFound();

  const isBuyer = b.user_id === me.id;
  const isAdmin = me.role === "admin";
  if (!isBuyer && !isAdmin) redirect(`/bookings/${id}`);

  // 환불 가능 상태가 아니면 상세로 돌려보냄
  if (!["paid", "shot", "delivered"].includes(b.status)) redirect(`/bookings/${id}`);

  const fmt = new Intl.NumberFormat("ko-KR");
  const artist = b.photographer?.display_name || "작가";

  return (
    <main className="mx-auto max-w-lg px-3.5 sm:px-5 py-8 font-kr">
      <Link href={`/bookings/${id}`} className="text-sm text-fg/50 hover:text-fg">
        ← 예약 상세
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">환불 {isAdmin && !isBuyer ? "처리" : "신청"}</h1>

      {/* 예약 요약 */}
      <div className="mt-6 rounded-xl border border-fg/10 p-5 text-sm">
        <Line label="작가" value={artist} />
        <Line label="패키지" value={b.package?.name ?? b.package_snapshot?.name ?? "—"} />
        <Line label="일시" value={fmtShootAt(b.shoot_at)} />
        <div className="mt-3 flex items-center justify-between border-t border-fg/10 pt-3">
          <span className="font-medium">환불 예정 금액</span>
          <span className="text-lg font-semibold">₩{fmt.format(b.amount_krw ?? 0)}</span>
        </div>
      </div>

      {/* 환불 정책 안내 */}
      <div className="mt-4 rounded-xl bg-fg/[0.04] px-4 py-4 text-sm text-fg/70">
        <p className="font-medium text-fg/80">환불은 이렇게 진행돼요</p>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-[13px] leading-relaxed">
          <li>
            우리 플랫폼은 결제를 중개하지 않아요. 촬영비는 작가 계좌로 직접 송금되었으므로,
            <b> 환불 금액도 작가가 직접 고객 계좌로 송금</b>합니다.
          </li>
          <li>환불을 신청하면 예약이 <b>환불됨</b> 상태로 바뀌고, 작가에게 즉시 알림이 갑니다.</li>
          <li>작가가 환불 송금을 완료하면 채팅으로 확인할 수 있어요. 계좌 정보는 채팅으로 전달해주세요.</li>
          <li>촬영·보정 진행 정도에 따른 부분 환불은 작가와 협의해 정해주세요.</li>
        </ul>
      </div>

      {/* 신청 */}
      <form action={refundBooking} className="mt-6">
        <input type="hidden" name="id" value={b.id} />
        <button className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white hover:opacity-90">
          {isAdmin && !isBuyer ? "환불 처리 (운영자)" : "환불 신청하기"}
        </button>
      </form>
      <Link
        href={`/bookings/${id}`}
        className="mt-3 block text-center text-sm text-fg/50 hover:text-fg"
      >
        취소하고 돌아가기
      </Link>
    </main>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="shrink-0 text-fg/50">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBooking, STATUS_LABEL, statusTone, fmtShootAt } from "@/lib/bookings";
import { acceptBooking, rejectBooking, cancelBooking } from "@/app/actions/bookings";

// 예약 상세 + 역할·상태별 액션
export default async function BookingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=/bookings/${id}`);

  const b = await getBooking(id);
  if (!b) notFound();

  const isBuyer = b.user_id === me.id;
  const isOwner = !!me.photographer && b.photographer_id === me.photographer.id;
  const fmt = new Intl.NumberFormat("ko-KR");
  const counterpart = isBuyer
    ? b.photographer?.display_name || `@${b.photographer?.handle}`
    : b.user?.display_name || "고객";

  return (
    <main className="mx-auto max-w-lg px-4 sm:px-6 py-8 font-kr">
      <Link href="/bookings" className="text-sm text-fg/50 hover:text-fg">
        ← 예약
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">예약 상세</h1>
        <span className={`rounded-full px-2.5 py-1 text-xs ${statusTone(b.status)}`}>
          {STATUS_LABEL[b.status]}
        </span>
      </div>

      <dl className="mt-6 flex flex-col gap-3 rounded-xl border border-fg/10 p-5 text-sm">
        <Row label={isBuyer ? "작가" : "고객"} value={counterpart} />
        <Row label="패키지" value={b.package?.name ?? b.package_snapshot?.name ?? "—"} />
        <Row label="일시" value={fmtShootAt(b.shoot_at)} />
        <Row label="장소" value={b.location_text || "—"} />
        <Row label="금액" value={b.amount_krw ? `₩${fmt.format(b.amount_krw)}` : "—"} />
        {b.memo && <Row label="메모" value={b.memo} />}
      </dl>

      {/* 채팅 링크 */}
      {b.photographer && (
        <Link
          href={`/photographers/${b.photographer.handle}`}
          className="mt-4 inline-block text-sm text-fg/60 hover:text-fg"
        >
          {isBuyer ? "작가 프로필 보기" : ""}
        </Link>
      )}

      {/* 액션 */}
      <div className="mt-6 flex flex-col gap-2">
        {/* 작가: 요청 수락/거절 */}
        {isOwner && b.status === "requested" && (
          <div className="flex gap-2">
            <form action={acceptBooking} className="flex-1">
              <input type="hidden" name="id" value={b.id} />
              <button className="w-full rounded-xl bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90">
                수락
              </button>
            </form>
            <form action={rejectBooking} className="flex-1">
              <input type="hidden" name="id" value={b.id} />
              <button className="w-full rounded-xl border border-fg/20 py-3 text-sm text-fg/70 hover:bg-fg/[0.04]">
                거절
              </button>
            </form>
          </div>
        )}

        {/* 구매자: 수락됨 → 결제 (5단계) */}
        {isBuyer && b.status === "accepted" && (
          <button
            disabled
            title="결제는 5단계에서 연결됩니다"
            className="w-full rounded-xl bg-fg/30 py-3 text-sm font-semibold text-bg"
          >
            결제하기 (곧 오픈)
          </button>
        )}

        {/* 양측: 결제 전 취소 */}
        {["requested", "accepted"].includes(b.status) && (
          <form action={cancelBooking}>
            <input type="hidden" name="id" value={b.id} />
            <button className="w-full rounded-xl px-4 py-2.5 text-sm text-brand hover:bg-brand/[0.06]">
              예약 취소
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-fg/50">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBooking, fmtShootAt } from "@/lib/bookings";
import { ensureTransferRecord, getPayoutAccountForBooking } from "@/lib/payments";

// 송금 안내 — 사용자가 작가 계좌로 직접 촬영비를 송금하도록 계좌를 노출한다.
// 입금 확인은 작가가 예약 상세에서 처리한다(→ accepted→paid).
export default async function TransferGuidePage({
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

  // 송금 대기 결제 레코드 보장(멱등) + 작가 계좌 조회(참여자 한정)
  await ensureTransferRecord(id, b.amount_krw ?? 0);
  const account = await getPayoutAccountForBooking(id);
  const fmt = new Intl.NumberFormat("ko-KR");
  const artist = b.photographer?.display_name || "작가";

  return (
    <main className="mx-auto max-w-lg px-4 sm:px-6 py-8 font-kr">
      <Link href={`/bookings/${id}`} className="text-sm text-fg/50 hover:text-fg">
        ← 예약 상세
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">송금 안내</h1>
      <p className="mt-1 text-sm text-fg/55">
        아래 계좌로 촬영비를 직접 송금해주세요. 작가가 입금을 확인하면 결제가 완료됩니다.
      </p>

      {/* 금액 요약 */}
      <div className="mt-6 rounded-xl border border-fg/10 p-5 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-fg/50">작가</span>
          <span className="text-right">{artist}</span>
        </div>
        <div className="mt-3 flex justify-between gap-4">
          <span className="text-fg/50">패키지</span>
          <span className="text-right">{b.package?.name ?? b.package_snapshot?.name ?? "—"}</span>
        </div>
        <div className="mt-3 flex justify-between gap-4">
          <span className="text-fg/50">일시</span>
          <span className="text-right">{fmtShootAt(b.shoot_at)}</span>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-fg/10 pt-4">
          <span className="font-medium">보낼 금액</span>
          <span className="text-lg font-semibold">₩{fmt.format(b.amount_krw ?? 0)}</span>
        </div>
      </div>

      {/* 작가 계좌 */}
      {account ? (
        <div className="mt-4 rounded-xl border border-fg/15 bg-surface p-5">
          <p className="text-xs text-fg/50">입금 계좌</p>
          <div className="mt-2 flex flex-col gap-2 text-sm">
            <Line label="은행" value={account.bank} />
            <Line label="계좌번호" value={account.number} mono />
            <Line label="예금주" value={account.holder} />
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          작가가 아직 수취 계좌를 등록하지 않았어요. 채팅으로 계좌를 문의해주세요.
        </div>
      )}

      <div className="mt-4 rounded-xl bg-fg/[0.04] px-4 py-3 text-xs text-fg/60">
        · 송금 시 받는 분 통장에 <b>예약자 본인 이름</b>으로 보내면 작가가 확인하기 쉬워요.<br />
        · 송금 후 별도 확인이 필요하면 <Link href="/chat" className="underline">채팅</Link>으로 작가에게 알려주세요.<br />
        · 플랫폼은 결제를 중개하지 않으며, 송금은 사용자와 작가 간 직접 거래입니다.
      </div>

      <p className="mt-4 text-center text-xs text-fg/45">
        작가의 입금 확인을 기다리는 중입니다. 확인되면 예약 상태가 “결제 완료”로 바뀝니다.
      </p>
    </main>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="shrink-0 text-fg/50">{label}</span>
      <span className={`text-right font-medium ${mono ? "tabular-nums tracking-tight" : ""}`}>
        {value}
      </span>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { fmtShootAt } from "@/lib/bookings";
import { listMySettlements, type SettlementRow, type SettlementStage } from "@/lib/payments";
import { ackSettlement, disputeSettlement } from "@/app/actions/payments";

/*
  작가 정산 내역 — 사매 계좌 에스크로 기준.

  ⚠️ 이 화면은 2026-09 에 통째로 다시 썼다. 이전 버전은 **리드(문의 해제) 모델**이었다 —
  작가가 리드마다 건당 수수료를 사매에 내던 구조라 "입금 대기 / 납부 완료" 를 보여줬고,
  주석에도 *"사용자→작가 촬영비는 오프플랫폼이라 플랫폼이 보관/정산하지 않는다"* 고 적혀
  있었다. 지금은 **돈의 방향이 반대다.** 고객이 사매에 내고, 사매가 수수료를 뗀 뒤
  작가에게 보낸다.

  이 화면으로 오는 경로는 두 개다.
    · 알림톡 「정산 완료」 버튼 → samae.ai/studio/settlements (notify-templates.ts)
    · 정산 관련 인앱 알림 링크 (notify-user.ts)

  그래서 여기서 답해야 하는 질문은 하나다 — **내 돈이 지금 어디까지 왔나.**
  금액을 바꾸는 조작(수령 확인 등)은 채팅방 예약 카드에서 한다. 여기는 읽기 전용이다.
*/

const STAGE_LABEL: Record<SettlementStage, string> = {
  awaiting_transfer: "고객 입금 대기",
  checking: "입금 확인 중",
  settling: "정산 예정",
  settled: "정산 완료",
  refunded: "환불됨",
};

const STAGE_TONE: Record<SettlementStage, string> = {
  awaiting_transfer: "text-fg/45",
  checking: "text-warning",
  settling: "text-brand",
  settled: "text-success",
  refunded: "text-fg/45",
};

export default async function SettlementsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/settlements");
  if (!me.photographer) redirect("/studio");

  const rows = await listMySettlements(me.photographer.id);
  const fmt = new Intl.NumberFormat("ko-KR");

  // 받을 돈 / 받은 돈 — 환불 건은 어느 쪽에도 넣지 않는다(정산이 없어진 건이다)
  const pendingTotal = rows
    .filter((r) => r.stage === "checking" || r.stage === "settling")
    .reduce((sum, r) => sum + r.netKrw, 0);
  const settledTotal = rows
    .filter((r) => r.stage === "settled")
    .reduce((sum, r) => sum + r.netKrw, 0);

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 font-kr">
      <Link href="/studio" className="text-sm text-fg/50 hover:text-fg">
        ← 스튜디오
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">정산 내역</h1>
      <p className="mt-1 text-xs leading-relaxed text-fg/45">
        촬영비는 사매가 받아 두고, 중개 수수료를 뺀 금액을 작가님 계좌로 보내드려요.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-fg/10 p-4">
          <p className="text-xs text-fg/50">정산 예정</p>
          <p className="mt-1 text-lg font-semibold text-brand">₩{fmt.format(pendingTotal)}</p>
        </div>
        <div className="rounded-xl border border-fg/10 p-4">
          <p className="text-xs text-fg/50">정산 완료</p>
          <p className="mt-1 text-lg font-semibold text-success">₩{fmt.format(settledTotal)}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-xl border border-fg/10 p-6 text-sm leading-relaxed text-fg/60">
          아직 정산할 예약이 없어요. 고객이 예약을 수락하고 입금하면 여기에 표시됩니다.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {rows.map((r) => (
            <SettlementItem key={r.bookingId} row={r} fmt={fmt} />
          ))}
        </ul>
      )}

      <p className="mt-8 text-xs leading-relaxed text-fg/40">
        정산이 실제와 다르면 채팅방의 예약 카드에서 알려주세요. 금액 확인과 재처리는 사매가
        합니다.
      </p>
    </main>
  );
}

function SettlementItem({ row, fmt }: { row: SettlementRow; fmt: Intl.NumberFormat }) {
  const refunded = row.stage === "refunded";
  return (
    <li className="rounded-xl border border-fg/10 px-4 py-3.5 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href={`/bookings/${row.bookingId}`}
            className="block truncate font-medium hover:text-brand"
          >
            {row.customerName}
          </Link>
          <p className="mt-0.5 text-xs text-fg/50">{fmtShootAt(row.shootAt, row.shootDate)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-xs ${STAGE_TONE[row.stage]}`}>{STAGE_LABEL[row.stage]}</p>
          <p className={`mt-0.5 font-semibold ${refunded ? "text-fg/35 line-through" : ""}`}>
            ₩{fmt.format(row.netKrw)}
          </p>
        </div>
      </div>

      {/* 금액이 어떻게 나왔는지 — 수수료를 감추면 정산 문의가 늘어난다 */}
      {!refunded && (
        <p className="mt-2 border-t border-fg/[0.06] pt-2 text-xs tabular-nums text-fg/45">
          고객 결제 ₩{fmt.format(row.paidKrw)} · 사매 수수료 ₩{fmt.format(row.feeKrw)}
        </p>
      )}

      {/* 수령 확인 — 사매가 보냈다고 기록한 건에 대해 작가가 닫아준다.
          이 고리가 없으면 "보냈다" 는 사매 기록만 남고 돈이 중간에 멈춰도 아무도 모른다. */}
      {row.stage === "settled" && !row.ackAt && !row.disputeAt && (
        <div className="mt-2.5 flex gap-2 border-t border-fg/[0.06] pt-2.5">
          <form action={ackSettlement} className="flex-1">
            <input type="hidden" name="id" value={row.bookingId} />
            <button className="w-full cursor-pointer rounded-lg bg-success/10 py-2 text-xs font-semibold text-success transition-colors hover:bg-success/[0.16]">
              받았어요
            </button>
          </form>
          <form action={disputeSettlement}>
            <input type="hidden" name="id" value={row.bookingId} />
            <button className="cursor-pointer rounded-lg px-3 py-2 text-xs font-medium text-fg/50 transition-colors hover:bg-fg/[0.06] hover:text-fg">
              못 받았어요
            </button>
          </form>
        </div>
      )}

      {row.disputeAt && (
        <p className="mt-2 text-xs text-warning">
          확인 요청하신 건이에요. 사매가 송금 내역을 확인하고 다시 연락드립니다.
        </p>
      )}
      {row.ackAt && <p className="mt-2 text-xs text-success">수령 확인 완료</p>}
    </li>
  );
}

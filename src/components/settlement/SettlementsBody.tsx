// 작가 정산 내역의 **지면** — 데이터는 받아서 그리기만 한다.
//
// 페이지에서 떼어낸 이유는 하나다: 샌드박스(/dev/money)가 **같은 화면**을 그려야 해서다.
// 마크업을 베껴 두면 실제와 다른 화면을 QA 하게 된다 — 온보딩 샌드박스에서 한 번 겪었다.
// 여기가 유일한 원본이고, 실제 페이지도 샌드박스도 이걸 쓴다.
//
// 훅을 쓰지 않는다. 서버 페이지에서 부르면 서버 컴포넌트로, 샌드박스(클라이언트)에서
// 부르면 클라이언트 컴포넌트로 같은 코드가 동작한다.

import Link from "next/link";
// lib/bookings 가 아니라 여기서 — 그쪽은 server-only 라 클라이언트에서 못 부른다
import { fmtShootAt } from "@/lib/booking-format";
import type { SettlementRow, SettlementStage } from "@/lib/payments";

const STAGE_LABEL: Record<SettlementStage, string> = {
  awaiting_transfer: "고객 입금 대기",
  checking: "입금 확인 중",
  settling: "정산 예정",
  settled: "정산 완료",
  refunded: "환불됨",
};

const STAGE_TONE: Record<SettlementStage, string> = {
  awaiting_transfer: "text-faint",
  checking: "text-warning",
  settling: "text-brand-ink",
  settled: "text-success-ink",
  refunded: "text-faint",
};

export type SettlementActions = {
  ack: (formData: FormData) => void | Promise<void>;
  dispute: (formData: FormData) => void | Promise<void>;
};

export function SettlementsBody({
  rows,
  actions,
}: {
  rows: SettlementRow[];
  actions: SettlementActions;
}) {
  const fmt = new Intl.NumberFormat("ko-KR");

  // 받을 돈 / 받은 돈 — 환불 건은 어느 쪽에도 넣지 않는다(정산이 없어진 건이다)
  const pendingTotal = rows
    .filter((r) => r.stage === "checking" || r.stage === "settling")
    .reduce((sum, r) => sum + r.netKrw, 0);
  const settledTotal = rows
    .filter((r) => r.stage === "settled")
    .reduce((sum, r) => sum + r.netKrw, 0);
  // 원천징수 안내는 해당되는 작가에게만 보여준다 — 사업자 작가에게는 없는 이야기다
  const withheld = rows.some((r) => r.withholdingKrw > 0);

  // 실제 부담률을 행에서 되짚는다. "20%" 로 박아 두면 요율이 다른 작가에게 거짓말이 되고,
  // 부가세를 따로 붙여 쓰면 나중에 "또 붙네" 로 읽힌다 (HANDOFF §3-2).
  const sample = rows.find((r) => r.paidKrw > 0 && r.feeKrw > 0);
  const burdenPct = sample ? +((sample.feeKrw / sample.paidKrw) * 100).toFixed(1) : null;

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 font-kr">
      <Link href="/studio" className="text-sm text-muted hover:text-fg">
        ← 스튜디오
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">정산 내역</h1>
      <p className="mt-1 text-xs leading-relaxed text-faint">
        촬영비는 사매가 받아 두고, 결과물 전달이 끝나면 중개 수수료
        {burdenPct != null && <b className="font-semibold text-muted"> {burdenPct}%(부가세 포함)</b>}를
        뺀 금액을 작가님 계좌로 보내드려요. 결제대행 수수료는 사매가 부담해요.
      </p>
      {/* 원천징수는 안 물어보면 "왜 덜 들어왔지" 가 되는 항목이다. 뗀 세금이 사라지는 게
          아니라 내년 5월에 정산된다는 것까지 말해야 문의가 줄어든다. */}
      {withheld && (
        <p className="mt-2 rounded-xl bg-surface-2 px-3.5 py-3 text-xs leading-relaxed text-muted">
          사업자 등록이 없는 작가님께는 소득세법에 따라{" "}
          <b className="font-semibold text-fg">사업소득세 3%와 지방소득세 0.3%</b>를 사매가
          원천징수해 대신 신고·납부해요. 없어지는 돈이 아니라 미리 낸 세금이고, 다음 해 5월
          종합소득세 신고 때 정산돼요. 사업자 등록 후 프로필에서 사업자 정보를 등록하시면
          원천징수 없이 세금계산서로 처리됩니다.
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-fg/10 p-4">
          <p className="text-xs text-muted">정산 예정</p>
          <p className="mt-1 text-lg font-semibold text-brand-ink">₩{fmt.format(pendingTotal)}</p>
        </div>
        <div className="rounded-xl border border-fg/10 p-4">
          <p className="text-xs text-muted">정산 완료</p>
          <p className="mt-1 text-lg font-semibold text-success-ink">₩{fmt.format(settledTotal)}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-xl border border-fg/10 p-6 text-sm leading-relaxed text-fg/60">
          아직 정산할 예약이 없어요. 고객이 예약을 수락하고 입금하면 여기에 표시됩니다.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {rows.map((r) => (
            <SettlementItem key={r.bookingId} row={r} fmt={fmt} actions={actions} />
          ))}
        </ul>
      )}

      <p className="mt-8 text-xs leading-relaxed text-faint">
        정산이 실제와 다르면 채팅방의 예약 카드에서 알려주세요. 금액 확인과 재처리는 사매가
        합니다.
      </p>
    </main>
  );
}

function SettlementItem({
  row,
  fmt,
  actions,
}: {
  row: SettlementRow;
  fmt: Intl.NumberFormat;
  actions: SettlementActions;
}) {
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
          <p className="mt-0.5 text-xs text-muted">{fmtShootAt(row.shootAt, row.shootDate)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-xs ${STAGE_TONE[row.stage]}`}>{STAGE_LABEL[row.stage]}</p>
          <p className={`mt-0.5 font-semibold ${refunded ? "text-faint line-through" : ""}`}>
            ₩{fmt.format(row.netKrw)}
          </p>
        </div>
      </div>

      {/* 금액이 어떻게 나왔는지 — 수수료를 감추면 정산 문의가 늘어난다 */}
      {!refunded && (
        <p className="mt-2 border-t border-fg/[0.06] pt-2 text-xs tabular-nums text-faint">
          고객 결제 ₩{fmt.format(row.paidKrw)} · 사매 수수료·부가세 ₩{fmt.format(row.feeKrw)}
          {/* 원천징수는 수수료가 아니라 **작가님 세금을 사매가 대신 낸 것**이다.
              한 줄에 뭉뚱그리면 "사매가 더 떼갔다" 로 읽힌다 — 그래서 따로 쓴다. */}
          {row.withholdingKrw > 0 && ` · 원천징수 ₩${fmt.format(row.withholdingKrw)}`}
        </p>
      )}

      {/* 수령 확인 — 사매가 보냈다고 기록한 건에 대해 작가가 닫아준다.
          이 고리가 없으면 "보냈다" 는 사매 기록만 남고 돈이 중간에 멈춰도 아무도 모른다. */}
      {row.stage === "settled" && !row.ackAt && !row.disputeAt && (
        <div className="mt-2.5 flex gap-2 border-t border-fg/[0.06] pt-2.5">
          <form action={actions.ack} className="flex-1">
            <input type="hidden" name="id" value={row.bookingId} />
            <button className="w-full cursor-pointer rounded-lg bg-success/10 py-2 text-xs font-semibold text-success-ink transition-colors hover:bg-success/[0.16]">
              받았어요
            </button>
          </form>
          <form action={actions.dispute}>
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
      {row.ackAt && <p className="mt-2 text-xs text-success-ink">수령 확인 완료</p>}
    </li>
  );
}

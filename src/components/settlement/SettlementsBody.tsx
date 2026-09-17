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
import { summarizeByYear } from "@/lib/settlement-summary";
import { SETTLEMENT_SLA_BUSINESS_DAYS, settlementSla } from "@/lib/settlement-sla";

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
  // 연간 요약 — **작가가 5월에 이거 한 장으로 신고한다.**
  // 우리가 원천징수를 안 하니 국세청이 우리에게서 받는 자료가 없다. 작가가 1년치를 혼자
  // 긁어모아야 하는데, 채팅방을 거슬러 세는 건 사람이 할 일이 아니다.
  const years = summarizeByYear(rows);

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
      {/* 언제 받는지가 없으면 작가는 매번 물어봐야 한다. 수수료·정산 정책 3조 2항이
          "각 건의 지급 기한은 스튜디오 > 정산에서 확인할 수 있다" 고 적은 자리다 —
          지면에 없으면 그 조문이 없는 화면을 가리키게 된다(2026-09-17 점검). */}
      <p className="mt-1 text-xs leading-relaxed text-faint">
        촬영비는 사매가 받아 두고, 결과물 전달이 끝나면 중개 수수료
        {burdenPct != null && <b className="font-semibold text-muted"> {burdenPct}%(부가세 포함)</b>}를
        뺀 금액을 작가님 계좌로 보내드려요. 전달을 알린 날부터{" "}
        <b className="font-semibold text-muted">{SETTLEMENT_SLA_BUSINESS_DAYS}영업일 이내</b>에 보내드리고,
        건별 기한은 아래 목록에 표시돼요. 결제대행 수수료는 사매가 부담해요.
      </p>

      {years.length > 0 && (
        <section className="mt-5 rounded-2xl border border-fg/10 p-4">
          <p className="text-sm font-semibold">연간 정산 요약</p>
          <p className="mt-1 text-xs leading-relaxed text-faint">
            5월 종합소득세 신고에 쓰세요. 사매는 원천징수를 하지 않으므로 국세청에 제출되는
            자료가 없어요 — <b className="text-muted">사매 수수료를 필요경비로 빼야</b> 대금
            전액에 세금을 내지 않습니다.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {years.map((y) => (
              <li key={y.year} className="rounded-xl bg-fg/[0.04] p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{y.year}년</span>
                  <a
                    href={`/studio/settlements/summary?year=${y.year}`}
                    className="text-xs text-muted underline underline-offset-2 hover:text-fg"
                  >
                    건별 내역 내려받기 (CSV)
                  </a>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs tabular-nums">
                  <Cell k="총수입금액" v={`₩${fmt.format(y.grossKrw)}`} hint={`${y.count}건`} />
                  <Cell k="필요경비 (사매 수수료)" v={`₩${fmt.format(y.feeKrw)}`} />
                  <Cell k="실수령" v={`₩${fmt.format(y.netKrw)}`} />
                </dl>
              </li>
            ))}
          </ul>
        </section>
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

function Cell({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div>
      <dt className="text-faint">{k}</dt>
      <dd className="mt-0.5 font-semibold">
        {v}
        {hint && <span className="ml-1 font-normal text-faint">{hint}</span>}
      </dd>
    </div>
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
  // 전달을 알렸는데 아직 안 보낸 건만 기한이 있다 (settlementSla 가 그 둘을 본다)
  const sla = refunded ? null : settlementSla(row.deliveredAt, row.settledAt);
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
          {/* 기한을 넘긴 건 작가가 먼저 알아야 한다 — 우리가 늦은 것이지 작가가 기다릴 일이 아니다 */}
          {sla && (
            <p className={`mt-0.5 text-[11px] ${sla.overdue ? "text-danger-ink" : sla.soon ? "text-warning" : "text-faint"}`}>
              {sla.label}
            </p>
          )}
        </div>
      </div>

      {/* 금액이 어떻게 나왔는지 — 수수료를 감추면 정산 문의가 늘어난다 */}
      {!refunded && (
        <p className="mt-2 border-t border-fg/[0.06] pt-2 text-xs tabular-nums text-faint">
          고객 결제 ₩{fmt.format(row.paidKrw)} · 사매 수수료·부가세 ₩{fmt.format(row.feeKrw)}
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

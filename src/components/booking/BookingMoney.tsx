// 어드민 거래 상세의 「금액」 블록.
//
// 운영자가 **은행 앱에 옮겨 적는 숫자**가 여기 있다. 그래서 화면에서 대충 빼서 보여주면
// 안 된다 — 「작가 송금액」은 서버가 markSettlementPaid 와 같은 식으로 계산해 `payoutKrw`
// 로 내려보낸다. 한때 여기서 `amount − feeKrw` 로 구하는 바람에 부가세만큼 과다 송금될
// 뻔했다(2026-09-15 QA).
//
// AdminBookings 에서 떼어냈다. 그쪽은 서버 액션을 잔뜩 물고 있어서, 샌드박스(/dev/money)가
// 그 파일을 통째로 끌어오면 클라이언트 번들이 `next/headers` 까지 따라온다.

const fmt = new Intl.NumberFormat("ko-KR");

export type BookingMoneyFields = {
  amount_krw: number | null;
  travel_fee_krw: number;
  /** 사매 중개 수수료 (부가세 별도) */
  feeKrw: number;
  /** "정률 20%" 처럼 사람이 읽는 근거 */
  feeLabel: string;
  vatKrw: number;
  /** 작가에게 실제로 보낼 금액 — 서버 계산 */
  payoutKrw: number;
  /** 정산이 끝났으면 그때 확정된 금액이 진실이다 */
  settlement_amount_krw: number | null;
};

export function BookingMoney({ b }: { b: BookingMoneyFields }) {
  const shootFee = (b.amount_krw ?? 0) - (b.travel_fee_krw ?? 0);
  return (
    <section>
      <p className="text-caption font-semibold text-muted">금액</p>
      <dl className="mt-1.5 flex flex-col gap-1 text-caption">
        <Row k="촬영비" v={`₩${fmt.format(shootFee)}`} />
        {b.travel_fee_krw > 0 && <Row k="출장비" v={`₩${fmt.format(b.travel_fee_krw)}`} />}
        <Row k="고객 입금액" v={`₩${fmt.format(b.amount_krw ?? 0)}`} strong />
        <Row k="수수료" v={`− ₩${fmt.format(b.feeKrw)} (${b.feeLabel})`} />
        <Row k="부가세" v={`− ₩${fmt.format(b.vatKrw)}`} />
        <Row k="작가 송금액" v={`₩${fmt.format(b.settlement_amount_krw ?? b.payoutKrw)}`} strong />
      </dl>
    </section>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-faint">{k}</dt>
      <dd className={`min-w-0 flex-1 ${strong ? "font-semibold text-fg" : "text-fg"}`}>{v}</dd>
    </div>
  );
}

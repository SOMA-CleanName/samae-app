// §4 QA 샌드박스의 가짜 데이터 — **네트워크로 나가는 게 하나도 없다.**
//
// 로컬이 운영 Supabase 를 그대로 본다(별도 dev 프로젝트가 없다). 그래서 실제 예약으로
// QA 하면 진짜 행이 바뀌고, 알림·정산 기록까지 따라 움직인다. 여기서는 화면만 본다.
//
// 금액은 **실제 계산 함수를 그대로 돌려서** 만든다 — 손으로 적어 두면 계산이 바뀌어도
// 샌드박스는 옛 숫자를 보여주고, 그러면 QA 가 거짓말을 한다.
//
// ⚠️ 날짜를 여기서 만든다. 컴포넌트 렌더 안에서 `new Date()` 를 부르면
//    react-hooks/purity 에 걸린다 — 모듈 함수로 빼 두는 게 이 저장소의 방식이다
//    (lib/discovery.ts 의 newFeedSeed 와 같은 처리).

import { feeWithVat, resolveFee, vatOnFee } from "@/lib/platform-fee";
import type { BusinessType } from "@/lib/platform-fee";
import type { SettlementRow } from "@/lib/payments";

/** 오늘로부터 n일 뒤 14:00 (KST) */
export function shootInDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const ymd = d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  return `${ymd}T14:00:00+09:00`;
}

export function daysAgo(n: number, minutes = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setMinutes(d.getMinutes() - minutes);
  return d.toISOString();
}

/** 샌드박스가 쓰는 사매 계좌 — 실제 계좌가 아니다 */
export const QA_ACCOUNT = {
  bank: "국민은행",
  number: "123456-01-789012",
  holder: "사매",
};

export const QA_AMOUNT = 300_000;

/**
 * 작가 정산 내역 3건 — 정산 완료 · 정산 예정 · 입금 확인 중.
 * 금액은 resolveFee / computeWithholding 이 낸 값이다.
 */
export function qaSettlementRows(businessType: BusinessType): SettlementRow[] {
  const make = (
    i: number,
    paidKrw: number,
    stage: SettlementRow["stage"],
    extra: Partial<SettlementRow> = {}
  ): SettlementRow => {
    const fee = resolveFee(null, paidKrw);
    const feeKrw = feeWithVat(fee);
    return {
      bookingId: `qa-${i}`,
      customerName: ["김고객", "이손님", "박의뢰"][i % 3],
      shootAt: shootInDays(-7 - i * 5),
      shootDate: null,
      paidKrw,
      feeKrw,
      netKrw: Math.max(0, paidKrw - feeKrw),
      stage,
      // 전달을 알린 건에만 지급 기한이 붙는다. settling 은 기한 배지가 보여야 하고,
      // checking(입금 확인 중)은 아직 전달 전이라 안 보여야 한다 — 둘 다 확인 대상이다
      deliveredAt: stage === "settled" || stage === "settling" ? daysAgo(3) : null,
      settledAt: stage === "settled" ? daysAgo(2) : null,
      ackAt: null,
      disputeAt: null,
      ...extra,
    };
  };
  return [
    make(0, 300_000, "settled"),
    make(1, 450_000, "settling"),
    // 소액 건 — 수수료(6,000원)가 대금에서 차지하는 비중이 큰 경우가 섞여 있어야 확인이 된다
    make(2, 30_000, "checking"),
  ];
}

/** 어드민 거래 상세의 「금액」 블록에 필요한 만큼만 채운 행 */
export function qaAdminMoney(businessType: BusinessType) {
  const amount = QA_AMOUNT;
  const fee = resolveFee(null, amount);
  return {
    amount_krw: amount,
    travel_fee_krw: 30_000,
    feeKrw: fee.feeKrw,
    feeLabel: "정률 20%",
    vatKrw: vatOnFee(fee.feeKrw),
    payoutKrw: Math.max(0, amount - feeWithVat(fee)),
    settlement_amount_krw: null,
  };
}

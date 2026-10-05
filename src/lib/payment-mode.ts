// 결제 방식 스위치 — **무통장(사매 계좌) ↔ PG**.
//
// 지금은 고객이 사매 계좌로 직접 입금하고, [입금 완료] 를 누르면 운영이 계좌 거래내역과
// 대조해 확인한다(`confirmBankTransferAdmin`). PG 심사가 끝나면 그 대조가 사라진다 —
// 결제가 승인되는 순간 웹훅이 같은 전이(accepted → paid)를 자동으로 한다.
//
// **그날 바꿀 것을 미리 한 곳에 모아 둔다.** 화면 여기저기에 "계좌로 입금해 주세요" 가
// 박혀 있으면 전환일에 그걸 찾아다니게 되고, 하나 놓치면 고객이 이미 카드로 결제한
// 뒤에 계좌 안내를 또 본다.
//
// ⚠️ **지금은 아무것도 달라지지 않는다.** 기본값이 무통장이고, PG 분기는 렌더되지 않는다.
//    전환일에 환경변수 하나(`PAYMENT_MODE=pg`)를 올리는 것이 시작점이다.
//    무엇을 더 해야 하는지는 `docs/42-pg-switch-plan.md` 에 파일 단위로 적어 뒀다.
//
// server-only 를 들이지 않는다 — 판별이 순수해야 테스트가 돈다.

export type PaymentMode = "bank_transfer" | "pg";

/**
 * 환경변수 문자열을 결제 방식으로 읽는다.
 *
 * **모르는 값이면 무통장으로 떨어진다.** 오타(`PAYMENT_MODE=PG_`) 하나로 PG 분기가
 * 켜지면 계좌 안내가 사라진 채 결제창은 없는 상태가 된다 — 돈을 낼 방법이 아예 없어진다.
 * 반대 방향의 사고(무통장인데 PG 로 켜짐)가 훨씬 비싸므로 모호하면 무통장이다.
 */
export function parsePaymentMode(raw: string | undefined | null): PaymentMode {
  return raw?.trim().toLowerCase() === "pg" ? "pg" : "bank_transfer";
}

/** 지금 이 배포의 결제 방식 */
export function paymentMode(): PaymentMode {
  return parsePaymentMode(process.env.PAYMENT_MODE);
}

export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  bank_transfer: "무통장 입금 (사매 계좌)",
  pg: "PG 결제 (KG이니시스)",
};

/** 운영자가 입금을 계좌 내역과 **손으로 대조**해야 하는가 */
export function needsManualConfirm(mode: PaymentMode = paymentMode()): boolean {
  return mode === "bank_transfer";
}

/** 고객에게 사매 계좌를 안내해야 하는가 */
export function showsBankAccount(mode: PaymentMode = paymentMode()): boolean {
  return mode === "bank_transfer";
}

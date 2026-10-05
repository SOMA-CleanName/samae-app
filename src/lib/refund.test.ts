// 환불 판정 — 취소환불정책 1.0 의 표와 5조 예시가 그대로 통과해야 한다.
//
// 남은 기간은 달력 날짜(KST) 기준이다. 정책 5조의 예시(촬영 9/20)를 그대로 옮겨
// 경계를 못박는다: 9/12 23:59 까지 = 8일 이상, 9/13~9/16 = 4~7일, 9/17~당일 = 3일 이내.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  refundQuote,
  daysUntilShoot,
  penaltyStarts,
  isLateBooking,
  lateBookingPenaltyPct,
  refundBasisLabel,
} from "./refund.ts";
import {
  resolveFee,
  readFeeSnapshot,
  feeSpecFromRow,
  penaltySplit,
  feeWithVat,
  effectiveBurdenPct,
  feeNeedsSetup,
  feeRateForDocs,
  DEFAULT_FEE_RATE,
} from "./platform-fee.ts";

const kst = (s: string) => new Date(`${s}+09:00`);
const iso = (d: Date) => d.toISOString();
const DAY = 24 * 60 * 60 * 1000;

// 촬영 9/20 14:00. 고객 지불 120,000 (촬영비 100,000 + 출장비 20,000). 수수료 20% = 24,000
const SHOOT = kst("2026-09-20T14:00:00");
const base = {
  shootAt: iso(SHOOT),
  amountKrw: 120000,
  travelFeeKrw: 20000,
  feeKrw: 24000,
  feeRate: 0.2,
};
/** 청약철회 기간이 끝난 지 오래된 결제 */
const PAID_LONG_AGO = iso(kst("2026-08-01T10:00:00"));

// ── 남은 날수 (5조) ──────────────────────────────────────────────

test("달력 날짜 차이 — 9/12 23:59 는 8일, 9/13 00:00 은 7일", () => {
  assert.equal(daysUntilShoot(base.shootAt, null, kst("2026-09-12T23:59:00")), 8);
  assert.equal(daysUntilShoot(base.shootAt, null, kst("2026-09-13T00:00:00")), 7);
  assert.equal(daysUntilShoot(base.shootAt, null, kst("2026-09-16T23:59:00")), 4);
  assert.equal(daysUntilShoot(base.shootAt, null, kst("2026-09-17T00:00:00")), 3);
  assert.equal(daysUntilShoot(base.shootAt, null, kst("2026-09-20T09:00:00")), 0);
  assert.equal(daysUntilShoot(base.shootAt, null, kst("2026-09-21T00:00:00")), -1);
});

test("촬영 시각이 UTC 로 날짜가 바뀌어도 KST 날짜로 센다", () => {
  // 9/20 00:30 KST = 9/19 15:30 UTC. KST 로는 9/20 이다
  const early = iso(kst("2026-09-20T00:30:00"));
  assert.equal(daysUntilShoot(early, null, kst("2026-09-12T23:59:00")), 8);
});

test("구간 시작일 — 40% 는 9/13, 90% 는 9/17 (둘 다 KST 자정)", () => {
  const s = penaltyStarts(base.shootAt, null)!;
  assert.equal(iso(s.at40), iso(kst("2026-09-13T00:00:00")));
  assert.equal(iso(s.at90), iso(kst("2026-09-17T00:00:00")));
});

// ── 입금 전 ──────────────────────────────────────────────────────

test("입금 전이면 환불이 아니라 취소", () => {
  const q = refundQuote({ ...base, transferMarkedAt: null, now: kst("2026-09-01T12:00:00") });
  assert.equal(q.basis, "not_paid");
  assert.equal(q.refundKrw, 0);
  assert.equal(q.feeWaived, true);
});

// ── 위약금 구간 (4조) ────────────────────────────────────────────

test("8일 이상 전 → 0%, 전액 환불, 아무에게도 수수료 없음", () => {
  const q = refundQuote({ ...base, transferMarkedAt: PAID_LONG_AGO, now: kst("2026-09-12T23:59:00") });
  assert.equal(q.basis, "penalty_0");
  assert.equal(q.percent, 100);
  assert.equal(q.refundKrw, 120000);
  assert.equal(q.penaltyKrw, 0);
  assert.equal(q.feeWaived, true);
  assert.equal(q.feeKrw, 0);
  assert.equal(q.photographerNetKrw, 0);
});

test("4~7일 전 → 40% 위약금, 60% 환불, 위약금은 작가 80 : 사매 20", () => {
  const q = refundQuote({ ...base, transferMarkedAt: PAID_LONG_AGO, now: kst("2026-09-13T00:00:00") });
  assert.equal(q.basis, "penalty_40");
  assert.equal(q.percent, 60);
  assert.equal(q.refundKrw, 72000);
  assert.equal(q.penaltyKrw, 48000);
  assert.equal(q.penaltyCompanyKrw, 9600);
  assert.equal(q.penaltyVatKrw, 960); // 수수료의 부가세도 작가 몫에서 뺀다 (작가약관 16조 1항)
  assert.equal(q.penaltyPhotographerKrw, 37440);
  // 정상 수수료(24,000)는 붙지 않는다 — 사매 몫은 위약금 배분뿐
  assert.equal(q.feeWaived, true);
  assert.equal(q.feeKrw, 9600);
  assert.equal(q.photographerNetKrw, 37440);
  // 돈이 새지 않는다 — 환불 + 수수료 + 부가세 + 작가 몫이 총액이다
  assert.equal(
    q.refundKrw + q.penaltyCompanyKrw + q.penaltyVatKrw + q.penaltyPhotographerKrw,
    120000
  );
});

test("4일 전(9/16)까지는 40%, 3일 전(9/17)부터는 90%", () => {
  const d4 = refundQuote({ ...base, transferMarkedAt: PAID_LONG_AGO, now: kst("2026-09-16T23:59:00") });
  assert.equal(d4.basis, "penalty_40");
  const d3 = refundQuote({ ...base, transferMarkedAt: PAID_LONG_AGO, now: kst("2026-09-17T00:00:00") });
  assert.equal(d3.basis, "penalty_90");
  assert.equal(d3.percent, 10);
  assert.equal(d3.refundKrw, 12000);
  assert.equal(d3.penaltyKrw, 108000);
  assert.equal(d3.penaltyCompanyKrw, 21600);
  assert.equal(d3.penaltyPhotographerKrw, 84240);
});

test("촬영 당일 촬영 전 취소 → 90% (노쇼가 아니다)", () => {
  const q = refundQuote({ ...base, transferMarkedAt: PAID_LONG_AGO, now: kst("2026-09-20T09:00:00") });
  assert.equal(q.basis, "penalty_90");
});

test("촬영이 지난 뒤 → 환불 없음, 정상 수수료 유지", () => {
  const q = refundQuote({ ...base, transferMarkedAt: PAID_LONG_AGO, now: kst("2026-09-21T00:00:00") });
  assert.equal(q.basis, "after_shoot");
  assert.equal(q.refundKrw, 0);
  assert.equal(q.feeWaived, false);
  assert.equal(q.feeKrw, 24000);
  assert.equal(q.photographerNetKrw, 93600); // 실제 정산과 같게 수수료+부가세를 뺀다
});

// ── 취소 시점 = 신청 시각 (5조 3항) ──────────────────────────────

test("신청 시각이 있으면 판정 시각이 아니라 신청 시각으로 센다", () => {
  // 9/12 에 신청했는데 어드민이 9/15 에 판정 — 8일 구간이 맞다
  const q = refundQuote({
    ...base,
    transferMarkedAt: PAID_LONG_AGO,
    requestedAt: iso(kst("2026-09-12T18:00:00")),
    now: kst("2026-09-15T10:00:00"),
  });
  assert.equal(q.basis, "penalty_0");
  assert.equal(q.refundKrw, 120000);
});

// 운영이 늦게 누르면 손해 보는 쪽이 고객이다. 작가와 이야기하고 합의를 받는 절차가
// 들어오면서 접수와 실행 사이가 며칠씩 벌어지므로, 그 사이에 구간이 밀리지 않아야 한다.
test("운영이 늦게 눌러도 구간이 밀리지 않는다 — 신청 9/13(40%), 실행 9/18", () => {
  const q = refundQuote({
    ...base,
    transferMarkedAt: PAID_LONG_AGO,
    requestedAt: iso(kst("2026-09-13T09:00:00")), // 남은 7일 → 40%
    now: kst("2026-09-18T10:00:00"), // 이때 누르면 남은 2일 → 90% 가 될 뻔했다
  });
  assert.equal(q.basis, "penalty_40");
  assert.equal(q.refundKrw, 72000); // 120,000 의 60%
});

test("촬영이 지난 뒤에 눌러도 신청이 촬영 전이면 환불된다", () => {
  const q = refundQuote({
    ...base,
    transferMarkedAt: PAID_LONG_AGO,
    requestedAt: iso(kst("2026-09-16T09:00:00")), // 남은 4일 → 40%
    now: kst("2026-09-25T10:00:00"), // 촬영(9/20)이 지난 시점에 실행
  });
  assert.equal(q.basis, "penalty_40");
  assert.notEqual(q.basis, "after_shoot"); // 늦게 눌렀다고 0원이 되면 안 된다
  assert.equal(q.refundKrw, 72000);
});

// ── 청약철회와 임박 예약 (3조) ───────────────────────────────────

test("결제 7일 이내 · 촬영 8일 이상 → 청약철회 라벨, 돈은 0% 구간과 같다", () => {
  const q = refundQuote({
    ...base,
    transferMarkedAt: iso(kst("2026-09-10T10:00:00")),
    now: kst("2026-09-12T10:00:00"),
  });
  assert.equal(q.basis, "withdrawal");
  assert.equal(q.refundKrw, 120000);
  assert.equal(q.feeWaived, true);
});

test("임박 예약(결제 시 촬영 7일 이하) + 동의 없음 → 결제 직후라도 전액 환불", () => {
  const q = refundQuote({
    ...base,
    transferMarkedAt: iso(kst("2026-09-14T10:00:00")),
    lateBookingConsentAt: null,
    now: kst("2026-09-15T10:00:00"), // 5일 남음
  });
  assert.equal(q.basis, "withdrawal");
  assert.equal(q.refundKrw, 120000);
});

test("임박 예약 + 동의 있음 → 결제 직후라도 구간 위약금(40%)", () => {
  const q = refundQuote({
    ...base,
    transferMarkedAt: iso(kst("2026-09-14T10:00:00")),
    lateBookingConsentAt: iso(kst("2026-09-14T09:59:00")),
    now: kst("2026-09-15T10:00:00"),
  });
  assert.equal(q.basis, "penalty_40");
  assert.equal(q.refundKrw, 72000);
});

test("결제 7일이 지나면 동의가 없어도 구간 위약금이 그대로 적용된다", () => {
  const q = refundQuote({
    ...base,
    transferMarkedAt: iso(kst("2026-09-05T10:00:00")),
    lateBookingConsentAt: null,
    now: kst("2026-09-15T10:00:00"),
  });
  assert.equal(q.basis, "penalty_40");
});

test("청약철회 경계 — 정확히 7일째는 아직 기간 안", () => {
  const paid = kst("2026-09-01T10:00:00");
  const q = refundQuote({
    ...base,
    transferMarkedAt: iso(paid),
    lateBookingConsentAt: null,
    now: new Date(paid.getTime() + 7 * DAY), // 9/8 — 촬영까지 12일
  });
  assert.equal(q.basis, "withdrawal");
});

// ── 운영 판정 ────────────────────────────────────────────────────

test("천재지변 — 전액 환불, 수수료 없음, 작가 0", () => {
  const q = refundQuote({ ...base, transferMarkedAt: PAID_LONG_AGO, override: "force_majeure", now: kst("2026-09-19T10:00:00") });
  assert.equal(q.basis, "force_majeure");
  assert.equal(q.refundKrw, 120000);
  assert.equal(q.feeWaived, true);
  assert.equal(q.photographerNetKrw, 0);
});

test("작가 사정 — 촬영 임박이어도 전액 환불하고 수수료 상당액을 작가에게 청구", () => {
  const q = refundQuote({ ...base, transferMarkedAt: PAID_LONG_AGO, override: "photographer_fault", now: kst("2026-09-19T10:00:00") });
  assert.equal(q.basis, "photographer_fault");
  assert.equal(q.refundKrw, 120000);
  assert.equal(q.feeClaimKrw, 24000);
  assert.equal(q.photographerNetKrw, -24000);
});

test("작가 노쇼 — 작가 사정과 같은 돈, 이력용 라벨만 다르다", () => {
  const q = refundQuote({ ...base, transferMarkedAt: PAID_LONG_AGO, override: "photographer_no_show", now: kst("2026-09-21T10:00:00") });
  assert.equal(q.basis, "photographer_no_show");
  assert.equal(q.refundKrw, 120000);
  assert.equal(q.feeClaimKrw, 24000);
});

test("고객 노쇼 — 위약금 100%, 수수료와 부가세를 뺀 나머지가 작가 몫", () => {
  const q = refundQuote({ ...base, transferMarkedAt: PAID_LONG_AGO, override: "customer_no_show", now: kst("2026-09-21T10:00:00") });
  assert.equal(q.basis, "customer_no_show");
  assert.equal(q.refundKrw, 0);
  assert.equal(q.penaltyKrw, 120000);
  assert.equal(q.penaltyCompanyKrw, 24000);
  assert.equal(q.photographerNetKrw, 93600);
});

test("부분 이행 — 운영이 정한 환불액, 나머지는 위약금처럼 배분", () => {
  const q = refundQuote({ ...base, transferMarkedAt: PAID_LONG_AGO, override: "partial", manualRefundKrw: 30000, now: kst("2026-09-21T10:00:00") });
  assert.equal(q.basis, "partial");
  assert.equal(q.refundKrw, 30000);
  assert.equal(q.penaltyKrw, 90000);
  assert.equal(q.penaltyCompanyKrw, 18000);
  assert.equal(q.penaltyVatKrw, 1800);
  assert.equal(q.penaltyPhotographerKrw, 70200);
});

test("부분 이행 환불액이 총액을 넘으면 총액까지만", () => {
  const q = refundQuote({ ...base, transferMarkedAt: PAID_LONG_AGO, override: "partial", manualRefundKrw: 999999, now: kst("2026-09-21T10:00:00") });
  assert.equal(q.refundKrw, 120000);
});

// ── 기타 ─────────────────────────────────────────────────────────

test("시각 없는 예약은 그날 23:59 기준 — 촬영 당일 자정 직전까지 90%", () => {
  const q = refundQuote({
    ...base,
    shootAt: null,
    shootDate: "2026-09-20",
    transferMarkedAt: PAID_LONG_AGO,
    now: kst("2026-09-20T23:00:00"),
  });
  assert.equal(q.basis, "penalty_90");
});

test("촬영일을 모르면 고객에게 유리하게 전액", () => {
  const q = refundQuote({ ...base, shootAt: null, shootDate: null, transferMarkedAt: PAID_LONG_AGO, now: kst("2026-09-01T10:00:00") });
  assert.equal(q.basis, "penalty_0");
  assert.equal(q.refundKrw, 120000);
});

test("요율이 10% 인 작가는 위약금 사매 몫도 10%", () => {
  const q = refundQuote({ ...base, feeRate: 0.1, transferMarkedAt: PAID_LONG_AGO, now: kst("2026-09-13T00:00:00") });
  assert.equal(q.penaltyCompanyKrw, 4800);
  assert.equal(q.penaltyPhotographerKrw, 42720);
});

test("임박 예약 판정과 그때의 위약금 비율", () => {
  assert.equal(isLateBooking(base.shootAt, null, kst("2026-09-12T10:00:00")), false); // 8일
  assert.equal(isLateBooking(base.shootAt, null, kst("2026-09-13T10:00:00")), true); // 7일
  assert.equal(lateBookingPenaltyPct(base.shootAt, null, kst("2026-09-13T10:00:00")), 40);
  assert.equal(lateBookingPenaltyPct(base.shootAt, null, kst("2026-09-18T10:00:00")), 90);
});

test("옛 규정의 basis 값도 라벨이 있다 — refund_reason 에 남아 있는 행", () => {
  assert.match(refundBasisLabel("penalty_50"), /옛 규정/);
  assert.match(refundBasisLabel("contact_delivered"), /옛 규정/);
  assert.equal(refundBasisLabel("penalty_40"), "촬영 4~7일 전 (위약금 40%)");
  assert.equal(refundBasisLabel(null), "");
});

// ── 수수료 (platform-fee.ts) ────────────────────────────────────

test("설정 없는 작가는 정률 18%(2026-09-21 신규 기준), 기준은 촬영 대금 전체", () => {
  const f = resolveFee(null, 120000);
  assert.equal(f.mode, "rate");
  assert.equal(f.rate, 0.18);
  assert.equal(f.feeKrw, 21600);
  assert.equal(f.vatKrw, 2160);
  assert.equal(feeWithVat(f), 23760);
  assert.equal(f.baseKrw, 120000);
});

test("정액을 명시한 작가는 정액, 대금보다 크면 대금까지만", () => {
  const f = resolveFee({ mode: "flat", amountKrw: 6000 }, 120000);
  assert.equal(f.feeKrw, 6000);
  assert.equal(f.vatKrw, 600);
  assert.equal(resolveFee({ mode: "flat", amountKrw: 6000 }, 4000).feeKrw, 4000);
});

test("정률인데 요율이 비면 기본 18% 로 받는다 — 매출이 조용히 0 이 되지 않게", () => {
  assert.equal(resolveFee({ mode: "rate", rate: null }, 100000).feeKrw, 18000);
});

test("요율을 명시한 작가(20% 등 기존 입점)는 기본값이 바뀌어도 그대로다", () => {
  assert.equal(resolveFee({ mode: "rate", rate: 0.2 }, 100000).feeKrw, 20000);
});

test("row → spec — fee_mode 가 비어 있으면 정률(기본)", () => {
  assert.equal(feeSpecFromRow({ fee_mode: null }).mode, "rate");
  assert.equal(feeSpecFromRow({ fee_mode: "flat", fee_amount_krw: 6000 }).mode, "flat");
  assert.equal(feeSpecFromRow({ fee_mode: "rate", fee_rate: "0.1000" as unknown as number }).rate, 0.1);
});

test("옛 스냅샷(baseKrw·vatKrw 없음)도 읽힌다 — 수수료 금액은 그대로, 부가세는 계산해 채운다", () => {
  const old = readFeeSnapshot({ mode: "rate", rate: 0.1, shootFeeKrw: 100000, feeKrw: 10000 });
  assert.ok(old);
  assert.equal(old.feeKrw, 10000);
  assert.equal(old.baseKrw, 100000);
  assert.equal(old.vatKrw, 1000);
  assert.equal(readFeeSnapshot({ feeKrw: "x" }), null);
});

test("위약금 배분과 사업자 유형별 실질 부담", () => {
  assert.deepEqual(penaltySplit(48000, 0.2), { companyKrw: 9600, vatKrw: 960, photographerKrw: 37440 });
  // 기본 요율(신규 18%) — 일반과세자는 요율 그대로, 간이·미등록은 부가세를 얹은 19.8%
  assert.equal(effectiveBurdenPct("general"), 18);
  assert.equal(effectiveBurdenPct("simplified"), 19.8);
  assert.equal(effectiveBurdenPct("unregistered"), 19.8);
  // 요율을 명시한 기존 작가(20%)는 그대로 22%
  assert.equal(effectiveBurdenPct("simplified", 0.2), 22);
});

test("요율이 책정되지 않았으면 승인을 막아야 한다", () => {
  /*
    운영 흐름: ① 신청 ② 어드민이 수수료 책정 ③ 승인 ④ 작가가 **그 요율로** 계약서 동의.
    요율 없이 승인하면 ④ 에서 작가가 전역 기본값을 자기 요율로 알고 동의하고, 나중에
    어드민이 값을 넣으면 **동의한 숫자와 실제 숫자가 달라진다.**
  */
  assert.equal(feeNeedsSetup({ mode: "rate", rate: null }), true);
  assert.equal(feeNeedsSetup({ mode: "rate", rate: 0 }), true);
  assert.equal(feeNeedsSetup(null), true, "설정 자체가 없으면 미책정이다");
  assert.equal(feeNeedsSetup({ mode: "flat", amountKrw: null }), true);

  assert.equal(feeNeedsSetup({ mode: "rate", rate: 0.18 }), false);
  assert.equal(feeNeedsSetup({ mode: "rate", rate: 0.1 }), false);
  assert.equal(feeNeedsSetup({ mode: "flat", amountKrw: 6000 }), false);
});

test("미책정이어도 계산은 멈추지 않는다 — 두 판정은 별개다", () => {
  /*
    ⚠️ resolveFee·feeRateForDocs 가 기본값으로 떨어뜨리는 것과 혼동하면 안 된다. 그 폴백은
       매출이 0 이 되는 사고를 막는 안전장치일 뿐 "책정됐다" 는 뜻이 아니다.
       (구현에서 feeNeedsSetup 에도 같은 폴백을 넣었다가 이 구분이 뒤집혀 테스트가 잡았다)
  */
  const unset = { mode: "rate" as const, rate: null };
  assert.equal(feeNeedsSetup(unset), true);
  assert.equal(resolveFee(unset, 100000).feeKrw, Math.round(100000 * DEFAULT_FEE_RATE));
  assert.equal(feeRateForDocs(unset), DEFAULT_FEE_RATE);
});

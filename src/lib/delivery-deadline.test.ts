import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeDeliveryDueAt,
  deliveryDaysOf,
  isRefundableOverdue,
  isValidExtension,
  overdueDays,
} from "./delivery-deadline.ts";

const kst = (s: string) => new Date(`${s}+09:00`);

test("상품에 기한이 없으면 21일, 범위 밖이면 21일", () => {
  assert.equal(deliveryDaysOf(null), 21);
  assert.equal(deliveryDaysOf({ delivery_days: 7 }), 7);
  assert.equal(deliveryDaysOf({ delivery_days: 0 }), 21);
  assert.equal(deliveryDaysOf({ delivery_days: 999 }), 21);
});

test("기한 = 촬영일(KST) + N일의 23:59:59", () => {
  const due = computeDeliveryDueAt(kst("2026-09-20T14:00:00").toISOString(), null, 21)!;
  assert.equal(due.toISOString(), kst("2026-10-11T23:59:59").toISOString());
  // 촬영 시각이 UTC 로 전날인 새벽도 KST 날짜로 센다
  const early = computeDeliveryDueAt(kst("2026-09-20T00:30:00").toISOString(), null, 1)!;
  assert.equal(early.toISOString(), kst("2026-09-21T23:59:59").toISOString());
  // 시간 미정 예약은 날짜로
  const dateOnly = computeDeliveryDueAt(null, "2026-09-20", 7)!;
  assert.equal(dateOnly.toISOString(), kst("2026-09-27T23:59:59").toISOString());
  assert.equal(computeDeliveryDueAt(null, null, 21), null);
});

test("초과 일수와 환불 가능 판정", () => {
  const due = kst("2026-10-11T23:59:59").toISOString();
  assert.equal(overdueDays(due, kst("2026-10-11T10:00:00")), 0);
  assert.equal(overdueDays(due, kst("2026-10-12T00:10:00")), 1);
  assert.equal(overdueDays(due, kst("2026-10-25T09:00:00")), 14);
  assert.equal(isRefundableOverdue(due, kst("2026-10-24T09:00:00")), false);
  assert.equal(isRefundableOverdue(due, kst("2026-10-25T09:00:00")), true);
  assert.equal(overdueDays(null), null);
});

test("연장 제안은 기존 기한보다 뒤, 지금부터 90일 안", () => {
  const now = kst("2026-10-01T10:00:00");
  const cur = kst("2026-10-11T23:59:59").toISOString();
  assert.equal(isValidExtension(cur, kst("2026-10-11T23:59:59"), now), false);
  assert.equal(isValidExtension(cur, kst("2026-10-18T23:59:59"), now), true);
  assert.equal(isValidExtension(cur, kst("2027-02-01T00:00:00"), now), false);
  assert.equal(isValidExtension(null, kst("2026-10-05T00:00:00"), now), true);
});

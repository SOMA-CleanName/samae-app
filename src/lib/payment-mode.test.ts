import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePaymentMode,
  needsManualConfirm,
  showsBankAccount,
  PAYMENT_MODE_LABEL,
} from "./payment-mode";

test("기본은 무통장 — 안 정해 뒀으면 지금 방식", () => {
  assert.equal(parsePaymentMode(undefined), "bank_transfer");
  assert.equal(parsePaymentMode(null), "bank_transfer");
  assert.equal(parsePaymentMode(""), "bank_transfer");
});

test("pg 로 켠다", () => {
  assert.equal(parsePaymentMode("pg"), "pg");
  assert.equal(parsePaymentMode("PG"), "pg");
  assert.equal(parsePaymentMode("  pg  "), "pg");
});

test("모르는 값은 무통장으로 떨어진다 — 오타로 PG 가 켜지면 안 된다", () => {
  // PG 분기가 잘못 켜지면 계좌 안내는 사라지고 결제창은 없다. 돈 낼 방법이 없어진다.
  for (const bad of ["PG_", "pg2", "true", "1", "kg", "inicis", "bank", "무통장"]) {
    assert.equal(parsePaymentMode(bad), "bank_transfer", `"${bad}" 는 무통장이어야 한다`);
  }
});

test("무통장이면 운영이 손으로 대조하고 계좌를 안내한다", () => {
  assert.equal(needsManualConfirm("bank_transfer"), true);
  assert.equal(showsBankAccount("bank_transfer"), true);
});

test("PG 면 대조도 계좌 안내도 없다", () => {
  assert.equal(needsManualConfirm("pg"), false);
  assert.equal(showsBankAccount("pg"), false);
});

test("두 방식 모두 라벨이 있다", () => {
  assert.ok(PAYMENT_MODE_LABEL.bank_transfer.length > 0);
  assert.ok(PAYMENT_MODE_LABEL.pg.length > 0);
});

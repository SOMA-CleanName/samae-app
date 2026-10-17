import { test } from "node:test";
import assert from "node:assert/strict";
import { shootStarted } from "./booking-status";

const now = new Date("2026-10-17T06:00:00Z"); // 15:00 KST

test("shootStarted — 시작 시각이 지났으면 연다", () => {
  assert.equal(shootStarted("2026-10-17T05:00:00Z", null, now), true); // 14:00 KST
  assert.equal(shootStarted("2026-10-17T06:00:00Z", null, now), true); // 정각
});

test("shootStarted — 시작 전이면 닫는다", () => {
  assert.equal(shootStarted("2026-10-17T07:00:00Z", null, now), false);
});

test("shootStarted — 날짜만 있으면 그날 0시(KST)부터", () => {
  assert.equal(shootStarted(null, "2026-10-17", now), true);
  assert.equal(shootStarted(null, "2026-10-18", now), false);
  // 10/18 0시 KST = 10/17 15:00Z
  assert.equal(shootStarted(null, "2026-10-18", new Date("2026-10-17T15:00:00Z")), true);
});

test("shootStarted — 일정이 없으면 닫는다", () => {
  assert.equal(shootStarted(null, null, now), false);
});

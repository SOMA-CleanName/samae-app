import { test } from "node:test";
import assert from "node:assert/strict";
import { SUMMARY_CSV_HEADER, summarizeByYear, summaryCsv } from "./settlement-summary";
import type { SettlementRow } from "./payments";

const row = (o: Partial<SettlementRow> = {}): SettlementRow => ({
  bookingId: "b1",
  customerName: "김고객",
  shootAt: "2026-03-10T05:00:00Z",
  shootDate: null,
  paidKrw: 300_000,
  feeKrw: 66_000,
  netKrw: 234_000,
  stage: "settled",
  settledAt: "2026-03-20T05:00:00Z",
  ackAt: null,
  disputeAt: null,
  ...o,
});

const day = (iso: string) => iso.slice(0, 10);

test("정산이 끝난 건만 센다 — 예정은 그 해 수입이 아니다", () => {
  const s = summarizeByYear([row(), row({ stage: "settling", settledAt: null })]);
  assert.equal(s.length, 1);
  assert.equal(s[0].count, 1);
});

test("환불 건은 빠진다", () => {
  assert.equal(summarizeByYear([row({ stage: "refunded" })]).length, 0);
});

test("총수입금액·필요경비·실수령을 더한다", () => {
  const s = summarizeByYear([row(), row({ bookingId: "b2" })]);
  assert.equal(s[0].grossKrw, 600_000);
  assert.equal(s[0].feeKrw, 132_000);
  assert.equal(s[0].netKrw, 468_000);
});

test("연도는 KST 기준 — UTC 로 자르면 1월 1일 새벽 건이 앞 해로 간다", () => {
  // 2026-12-31 16:00 UTC = 2027-01-01 01:00 KST
  const s = summarizeByYear([row({ settledAt: "2026-12-31T16:00:00Z" })]);
  assert.equal(s[0].year, 2027);
});

test("연도가 여럿이면 최근이 앞", () => {
  const s = summarizeByYear([
    row({ settledAt: "2025-05-01T00:00:00Z" }),
    row({ bookingId: "b2", settledAt: "2026-05-01T00:00:00Z" }),
  ]);
  assert.deepEqual(s.map((x) => x.year), [2026, 2025]);
});

test("CSV — 헤더 · 건별 · 합계", () => {
  const csv = summaryCsv([row(), row({ bookingId: "b2" })], 2026, day);
  const lines = csv.replace(/^﻿/, "").trim().split("\n");
  assert.equal(lines[0], SUMMARY_CSV_HEADER.join(","));
  assert.equal(lines.length, 5); // 헤더 + 2건 + 빈 줄 + 합계
  assert.ok(lines[lines.length - 1].startsWith("합계,2건"));
  assert.ok(lines[lines.length - 1].includes("600000"));
});

test("CSV — 그 해 것만 담는다", () => {
  const csv = summaryCsv([row(), row({ bookingId: "b2", settledAt: "2025-05-01T00:00:00Z" })], 2026, day);
  assert.equal(csv.replace(/^﻿/, "").trim().split("\n").length, 4); // 헤더 + 1건 + 빈 줄 + 합계
});

test("CSV — 정산일 오름차순. 신고서에 옮겨 적는 순서다", () => {
  const csv = summaryCsv(
    [
      row({ bookingId: "b2", settledAt: "2026-07-01T00:00:00Z", customerName: "나중" }),
      row({ bookingId: "b1", settledAt: "2026-02-01T00:00:00Z", customerName: "먼저" }),
    ],
    2026,
    day
  );
  const lines = csv.replace(/^﻿/, "").trim().split("\n");
  assert.ok(lines[1].includes("먼저"));
  assert.ok(lines[2].includes("나중"));
});

test("CSV — 쉼표가 든 이름이 셀을 밀지 않는다", () => {
  assert.ok(summaryCsv([row({ customerName: "김,고객" })], 2026, day).includes('"김,고객"'));
});

test("CSV — 엑셀이 한글을 깨뜨리지 않게 BOM", () => {
  assert.ok(summaryCsv([], 2026, day).startsWith("﻿"));
});

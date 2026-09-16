import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CSV_HEADER,
  groupByPerson,
  periodRange,
  simpleReportDueDate,
  toCsv,
  totalsOf,
  type WithholdingPayment,
} from "./withholding-report";

const pay = (o: Partial<WithholdingPayment> = {}): WithholdingPayment => ({
  bookingId: "b1",
  photographerId: "p1",
  legalName: "홍길동",
  displayName: "길동사진",
  residentMasked: "900101-1******",
  paidAt: "2026-09-10T00:00:00Z",
  baseKrw: 300_000,
  incomeTaxKrw: 9_000,
  localTaxKrw: 900,
  netKrw: 224_100,
  ...o,
});

test("기간 경계는 KST 로 자른다 — 말일 건이 새면 안 된다", () => {
  const r = periodRange("2026-09");
  assert.ok(r);
  // 9/1 00:00 KST = 8/31 15:00 UTC
  assert.equal(r.from, "2026-08-31T15:00:00.000Z");
  assert.equal(r.to, "2026-09-30T15:00:00.000Z");
});

test("12월은 다음 해로 넘어간다", () => {
  const r = periodRange("2026-12");
  assert.ok(r);
  assert.equal(r.to, "2026-12-31T15:00:00.000Z");
});

test("형식이 틀리면 null", () => {
  assert.equal(periodRange("2026-13"), null);
  assert.equal(periodRange("2026-9"), null);
  assert.equal(periodRange("aaaa-bb"), null);
});

test("간이지급명세서 기한은 다음 달 말일", () => {
  assert.equal(simpleReportDueDate("2026-09"), "2026-10-31");
  assert.equal(simpleReportDueDate("2026-01"), "2026-02-28"); // 평년
  assert.equal(simpleReportDueDate("2026-12"), "2027-01-31"); // 해 넘김
});

test("사람 단위로 묶고 금액을 더한다", () => {
  const people = groupByPerson([pay(), pay({ bookingId: "b2", baseKrw: 450_000, incomeTaxKrw: 13_500, localTaxKrw: 1_350, netKrw: 336_150 })]);
  assert.equal(people.length, 1);
  assert.equal(people[0].count, 2);
  assert.equal(people[0].baseKrw, 750_000);
  assert.equal(people[0].incomeTaxKrw, 22_500);
  assert.equal(people[0].localTaxKrw, 2_250);
});

test("금액 큰 사람이 위로 온다 — 확인할 게 먼저 보여야 한다", () => {
  const people = groupByPerson([
    pay({ photographerId: "p1", baseKrw: 100_000 }),
    pay({ photographerId: "p2", baseKrw: 900_000 }),
  ]);
  assert.deepEqual(people.map((p) => p.photographerId), ["p2", "p1"]);
});

test("실명이 비면 신고 불가로 표시된다", () => {
  const [p] = groupByPerson([pay({ legalName: null })]);
  assert.equal(p.blocked, true);
});

test("주민번호가 비면 신고 불가로 표시된다", () => {
  const [p] = groupByPerson([pay({ residentMasked: null })]);
  assert.equal(p.blocked, true);
});

test("둘 다 있으면 신고 가능", () => {
  const [p] = groupByPerson([pay()]);
  assert.equal(p.blocked, false);
});

test("합계 — 신고 불가 인원을 따로 센다", () => {
  const t = totalsOf(
    groupByPerson([pay({ photographerId: "p1" }), pay({ photographerId: "p2", legalName: null })])
  );
  assert.equal(t.people, 2);
  assert.equal(t.count, 2);
  assert.equal(t.taxKrw, (9_000 + 900) * 2);
  assert.equal(t.blocked, 1);
});

test("CSV — 복호화된 번호가 들어가고 헤더가 맞다", () => {
  const csv = toCsv(groupByPerson([pay()]), () => "9001011234567");
  const lines = csv.replace(/^﻿/, "").trim().split("\n");
  assert.equal(lines[0], CSV_HEADER.join(","));
  assert.ok(lines[1].includes("9001011234567"));
  assert.ok(lines[1].startsWith("홍길동,"));
});

test("CSV — 번호를 못 열면 마스킹 값이 들어간다 (빈 칸으로 두지 않는다)", () => {
  const csv = toCsv(groupByPerson([pay()]), () => null);
  assert.ok(csv.includes("900101-1******"));
});

test("CSV — 쉼표가 든 이름이 셀을 밀지 않는다", () => {
  const csv = toCsv(groupByPerson([pay({ legalName: "홍,길동" })]), () => null);
  assert.ok(csv.includes('"홍,길동"'));
});

test("CSV — 엑셀이 한글을 깨뜨리지 않게 BOM 을 붙인다", () => {
  assert.ok(toCsv([], () => null).startsWith("﻿"));
});

test("실명이 없으면 CSV 는 활동명으로 채운다 — 빈 줄을 만들지 않는다", () => {
  const csv = toCsv(groupByPerson([pay({ legalName: null })]), () => null);
  assert.ok(csv.includes("길동사진"));
});

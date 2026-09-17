import { test } from "node:test";
import assert from "node:assert/strict";
import { addBusinessDays, daysUntil } from "./business-days";
import { settlementSla } from "./settlement-sla";

const kst = (s: string) => new Date(`${s}+09:00`);

test("영업일은 주말을 건너뛴다 — 금요일 + 1영업일 = 월요일", () => {
  // 2026-09-18 은 금요일
  const mon = addBusinessDays(kst("2026-09-18T10:00:00"), 1);
  assert.equal(mon.getDay(), 1);
});

test("7영업일 — 금요일에 전달하면 다음다음 주 화요일", () => {
  const due = addBusinessDays(kst("2026-09-18T10:00:00"), 7);
  // 금(18) → 월21 화22 수23 목24 금25 월28 화29
  assert.equal(due.toISOString().slice(0, 10), "2026-09-29");
});

test("입력 Date 를 바꾸지 않는다", () => {
  const from = kst("2026-09-18T10:00:00");
  const before = from.getTime();
  addBusinessDays(from, 5);
  assert.equal(from.getTime(), before);
});

test("남은 날수는 KST 달력일로 센다", () => {
  // 9/29 09:00 KST 기한, 지금 9/28 23:00 KST → 하루 남음
  assert.equal(daysUntil(kst("2026-09-29T09:00:00"), kst("2026-09-28T23:00:00")), 1);
});

test("아직 여유가 있으면 남은 일수를 알려준다", () => {
  const sla = settlementSla("2026-09-18T01:00:00Z", null, kst("2026-09-22T10:00:00"));
  assert.ok(sla);
  assert.equal(sla.overdue, false);
  assert.match(sla.label, /지급까지/);
});

test("기한 당일은 '오늘까지'", () => {
  const sla = settlementSla("2026-09-18T01:00:00Z", null, kst("2026-09-29T10:00:00"));
  assert.ok(sla);
  assert.equal(sla.daysLeft, 0);
  assert.equal(sla.label, "오늘까지 지급");
});

test("넘기면 며칠 초과인지 센다 — 이게 목록에서 붉게 뜬다", () => {
  const sla = settlementSla("2026-09-18T01:00:00Z", null, kst("2026-10-02T10:00:00"));
  assert.ok(sla);
  assert.equal(sla.overdue, true);
  assert.match(sla.label, /3일 초과/);
});

test("2일 안쪽이면 미리 재촉한다", () => {
  const sla = settlementSla("2026-09-18T01:00:00Z", null, kst("2026-09-28T10:00:00"));
  assert.ok(sla);
  assert.equal(sla.soon, true);
  assert.equal(sla.overdue, false);
});

test("이미 정산했으면 셀 이유가 없다", () => {
  assert.equal(settlementSla("2026-09-18T01:00:00Z", "2026-09-20T01:00:00Z"), null);
});

test("전달 알림이 없으면 기산점이 없다 — 촬영만 끝난 건은 세지 않는다", () => {
  assert.equal(settlementSla(null, null), null);
});

test("망가진 날짜는 조용히 넘긴다", () => {
  assert.equal(settlementSla("아무거나", null), null);
});

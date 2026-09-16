import { test } from "node:test";
import assert from "node:assert/strict";
import { contactOpensAt, contactSendGate } from "./contact-gate";

const kst = (s: string) => new Date(`${s}+09:00`);
const SHOOT = "2026-09-20T14:00:00+09:00";

test("입금 전에는 못 보낸다", () => {
  const g = contactSendGate({ status: "accepted", shootAt: SHOOT, now: kst("2026-09-19T10:00:00") });
  assert.equal(g.allowed, false);
  if (!g.allowed) assert.equal(g.reason, "not_paid");
});

test("입금됐어도 촬영 8일 이상 남으면 아직 못 보낸다 — 위약금 0% 구간이라 이탈 경로가 열린다", () => {
  const g = contactSendGate({ status: "paid", shootAt: SHOOT, now: kst("2026-09-12T10:00:00") });
  assert.equal(g.allowed, false);
  if (!g.allowed) {
    assert.equal(g.reason, "too_early");
    assert.match(g.notice, /8일 남음/);
  }
});

test("경계 — 9/13 은 7일 남아 열린다 (위약금 40% 가 붙는 첫날)", () => {
  assert.equal(
    contactSendGate({ status: "paid", shootAt: SHOOT, now: kst("2026-09-13T00:00:00") }).allowed,
    true
  );
});

test("경계 — 9/12 23:59 는 8일이라 아직 닫혀 있다", () => {
  assert.equal(
    contactSendGate({ status: "paid", shootAt: SHOOT, now: kst("2026-09-12T23:59:00") }).allowed,
    false
  );
});

test("촬영 당일에도 열려 있다", () => {
  assert.equal(
    contactSendGate({ status: "paid", shootAt: SHOOT, now: kst("2026-09-20T09:00:00") }).allowed,
    true
  );
});

test("촬영이 지난 뒤에도 열려 있다 — 보정본 전달까지 조율이 남는다", () => {
  assert.equal(
    contactSendGate({ status: "delivered", shootAt: SHOOT, now: kst("2026-09-25T09:00:00") }).allowed,
    true
  );
});

test("촬영일이 없으면 닫는다 — 취소가 늘 전액 환불이라 이탈 유인이 가장 크다", () => {
  const g = contactSendGate({ status: "paid", shootAt: null, shootDate: null, now: kst("2026-09-13T00:00:00") });
  assert.equal(g.allowed, false);
  if (!g.allowed) assert.equal(g.reason, "no_shoot_date");
});

test("시각 없이 날짜만 있는 예약도 같은 경계로 본다", () => {
  const open = contactSendGate({ status: "paid", shootAt: null, shootDate: "2026-09-20", now: kst("2026-09-13T00:00:00") });
  const closed = contactSendGate({ status: "paid", shootAt: null, shootDate: "2026-09-20", now: kst("2026-09-12T23:59:00") });
  assert.equal(open.allowed, true);
  assert.equal(closed.allowed, false);
});

test("촬영 후 단계(shot·completed)도 보낼 수 있다", () => {
  for (const status of ["shot", "completed"]) {
    assert.equal(
      contactSendGate({ status, shootAt: SHOOT, now: kst("2026-09-21T09:00:00") }).allowed,
      true
    );
  }
});

test("열리는 날은 촬영 7일 전 자정(KST)", () => {
  const at = contactOpensAt(SHOOT);
  assert.ok(at);
  assert.equal(at.toISOString(), kst("2026-09-13T00:00:00").toISOString());
});

test("촬영일을 모르면 열리는 날도 없다", () => {
  assert.equal(contactOpensAt(null), null);
});

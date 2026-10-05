import { test } from "node:test";
import assert from "node:assert/strict";
import {
  awaitingConfirm,
  awaitingDeposit,
  awaitingSettle,
  overdueSettle,
  queueCounts,
  type QueueBooking,
} from "./admin-queues";

// 2026-09-19(토) 기준으로 센다. 영업일 계산이 끼므로 날짜를 고정한다.
const NOW = new Date("2026-09-19T03:00:00Z");

const b = (o: Partial<QueueBooking> & { status: string }): QueueBooking => ({
  transfer_marked_at: null,
  delivered_at: null,
  settled_at: null,
  refunded_at: null,
  ...o,
});

test("입금 확인 대기 — 고객이 입금 알림을 보낸 수락 건만", () => {
  const rows = [
    b({ status: "accepted", transfer_marked_at: "2026-09-18T00:00:00Z" }),
    b({ status: "accepted" }), // 아직 안 보냄
    b({ status: "paid", transfer_marked_at: "2026-09-10T00:00:00Z" }), // 이미 확인됨
    b({ status: "requested", transfer_marked_at: "2026-09-18T00:00:00Z" }), // 수락 전
  ];
  assert.equal(awaitingConfirm(rows).length, 1);
});

test("입금 대기와 입금 확인 대기는 겹치지 않는다", () => {
  const rows = [
    b({ status: "accepted", transfer_marked_at: "2026-09-18T00:00:00Z" }),
    b({ status: "accepted" }),
  ];
  assert.equal(awaitingConfirm(rows).length, 1);
  assert.equal(awaitingDeposit(rows).length, 1);
  // 섞이면 "지금 내가 할 일" 이 "고객을 기다리는 것" 에 파묻힌다
  assert.equal(awaitingConfirm(rows)[0], rows[0]);
  assert.equal(awaitingDeposit(rows)[0], rows[1]);
});

test("정산 대기 — 전달된 건만. 촬영 전은 오지 않는다", () => {
  const rows = [
    b({ status: "delivered", delivered_at: "2026-09-15T00:00:00Z" }),
    b({ status: "paid" }), // 전달 전
    b({ status: "shot" }), // 촬영만 됨
    b({ status: "accepted", delivered_at: "2026-09-15T00:00:00Z" }), // 돈이 안 들어옴
  ];
  assert.equal(awaitingSettle(rows, NOW).length, 1);
});

test("이미 정산했거나 환불된 건은 정산 대기가 아니다", () => {
  const rows = [
    b({ status: "completed", delivered_at: "2026-09-10T00:00:00Z", settled_at: "2026-09-12T00:00:00Z" }),
    b({ status: "delivered", delivered_at: "2026-09-10T00:00:00Z", refunded_at: "2026-09-12T00:00:00Z" }),
  ];
  assert.equal(awaitingSettle(rows, NOW).length, 0);
});

test("정산 대기는 급한 순 — 오래 묵은 게 위로", () => {
  const old = b({ status: "delivered", delivered_at: "2026-08-20T00:00:00Z" });
  const recent = b({ status: "delivered", delivered_at: "2026-09-18T00:00:00Z" });
  const sorted = awaitingSettle([recent, old], NOW);
  assert.equal(sorted[0], old, "기한이 임박한(지난) 건이 먼저 와야 한다");
  assert.equal(sorted[1], recent);
});

test("기한을 넘긴 건을 따로 센다", () => {
  const rows = [
    b({ status: "delivered", delivered_at: "2026-08-20T00:00:00Z" }), // 한참 지남
    b({ status: "delivered", delivered_at: "2026-09-18T00:00:00Z" }), // 어제 전달
  ];
  assert.equal(overdueSettle(rows, NOW).length, 1);
  assert.equal(awaitingSettle(rows, NOW).length, 2);
});

test("queueCounts 가 세 큐를 한 번에 센다", () => {
  const rows = [
    b({ status: "accepted", transfer_marked_at: "2026-09-18T00:00:00Z" }),
    b({ status: "accepted" }),
    b({ status: "delivered", delivered_at: "2026-08-20T00:00:00Z" }),
    b({ status: "delivered", delivered_at: "2026-09-18T00:00:00Z" }),
    b({ status: "completed", delivered_at: "2026-09-01T00:00:00Z", settled_at: "2026-09-03T00:00:00Z" }),
  ];
  assert.deepEqual(queueCounts(rows, NOW), {
    confirm: 1,
    settle: 2,
    settleOverdue: 1,
    deposit: 1,
  });
});

test("빈 목록에서도 0 을 돌려준다", () => {
  assert.deepEqual(queueCounts([], NOW), { confirm: 0, settle: 0, settleOverdue: 0, deposit: 0 });
});

test("원본 배열을 건드리지 않는다 — 정렬이 호출부의 순서를 뒤집으면 안 된다", () => {
  const first = b({ status: "delivered", delivered_at: "2026-09-18T00:00:00Z" });
  const second = b({ status: "delivered", delivered_at: "2026-08-20T00:00:00Z" });
  const rows = [first, second];
  awaitingSettle(rows, NOW);
  assert.equal(rows[0], first);
  assert.equal(rows[1], second);
});

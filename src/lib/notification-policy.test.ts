import test from "node:test";
import assert from "node:assert/strict";
import { decideNotification, NOTIFY_COOLDOWN_MS } from "./notification-policy";

// 발송 직전 판정 — "언제 보내고 언제 안 보내는가"가 이 알림의 전부라서 여기만 테스트한다.
// DB 왕복은 얇은 조회뿐이고, 정책은 전부 decideNotification 안에 있다.

const NOW = new Date("2026-09-08T12:00:00Z");
const base = { unread: 1, lastSentAt: null, phone: "01012345678", now: NOW, smsAllowed: true };

test("안 읽고 있으면 보낸다", () => {
  assert.deepEqual(decideNotification(base), { action: "send" });
});

test("예약이 실행될 때 이미 읽었으면 보내지 않는다", () => {
  // 채팅방을 열어둔 채 대화 중이던 경우가 여기서 걸러진다 — 지연을 두는 이유 그 자체
  assert.deepEqual(decideNotification({ ...base, unread: 0 }), {
    action: "skip",
    reason: "read",
  });
});

test("읽음 판정이 쿨다운보다 먼저다", () => {
  // 읽은 대화를 하루 뒤로 미뤄두면 그 예약이 남아 엉뚱한 시점에 되살아난다
  const justSent = new Date(NOW.getTime() - 60_000);
  assert.deepEqual(decideNotification({ ...base, unread: 0, lastSentAt: justSent }), {
    action: "skip",
    reason: "read",
  });
});

test("최근에 보냈으면 취소가 아니라 다음 창으로 미룬다", () => {
  const sentAt = new Date(NOW.getTime() - 3 * 3600_000); // 3시간 전
  const d = decideNotification({ ...base, lastSentAt: sentAt });
  assert.equal(d.action, "defer");
  assert.equal(
    (d as { until: Date }).until.getTime(),
    sentAt.getTime() + NOTIFY_COOLDOWN_MS,
    "마지막 발송 + 24h 로 미뤄야 계속 안 읽을 때 하루 뒤 한 번 더 간다"
  );
});

test("쿨다운이 지났으면 다시 보낸다", () => {
  const sentAt = new Date(NOW.getTime() - NOTIFY_COOLDOWN_MS - 1000);
  assert.deepEqual(decideNotification({ ...base, lastSentAt: sentAt }), { action: "send" });
});

test("쿨다운 경계에서는 보낸다", () => {
  const sentAt = new Date(NOW.getTime() - NOTIFY_COOLDOWN_MS);
  assert.deepEqual(decideNotification({ ...base, lastSentAt: sentAt }), { action: "send" });
});

test("대화가 사라졌으면 보내지 않는다", () => {
  assert.deepEqual(decideNotification({ ...base, unread: null }), {
    action: "skip",
    reason: "conversation_gone",
  });
});

test("번호가 없으면 보내지 않는다", () => {
  assert.deepEqual(decideNotification({ ...base, phone: null }), {
    action: "skip",
    reason: "no_phone",
  });
});

test("dev 에서는 실발송하지 않는다", () => {
  assert.deepEqual(decideNotification({ ...base, smsAllowed: false }), {
    action: "skip",
    reason: "dev",
  });
});

test("연달아 온 답장이 알림을 두 번 만들지 않는다", () => {
  // 작가가 3줄을 연달아 보내도 예약은 1건(0109 partial unique index)이고,
  // 그 1건이 발송된 뒤 새로 생긴 예약은 쿨다운에 걸려 미뤄진다.
  const firstSent = new Date(NOW.getTime() - 10 * 60_000); // 10분 전 첫 알림 발송
  const d = decideNotification({ ...base, unread: 3, lastSentAt: firstSent });
  assert.equal(d.action, "defer", "쌓인 답장 때문에 연타로 나가면 안 된다");
});

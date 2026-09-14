import test from "node:test";
import assert from "node:assert/strict";
import {
  decideChatReplyNotification,
  NOTIFY_COOLDOWN_MS,
  READ_HEARTBEAT_MS,
  VIEWING_WINDOW_MS,
} from "./notification-policy";

// 작가 답장 알림을 보낼지 말지 — 이 알림의 전부가 이 판정이라 여기만 테스트한다.

const NOW = new Date("2026-09-08T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const decide = (o: Partial<Parameters<typeof decideChatReplyNotification>[0]>) =>
  decideChatReplyNotification({ lastReadAt: null, lastSentAt: null, now: NOW, ...o });

test("앱을 닫아둔 사람에게는 보낸다", () => {
  assert.deepEqual(decide({}), { send: true });
});

test("방을 보고 있는 중이면 보내지 않는다", () => {
  // 열어두면 하트비트가 markRead 를 계속 불러 이 값이 갱신된다.
  // 창 길이는 상수에서 파생시킨다 — 숫자를 박아 두면 창을 줄일 때마다 테스트가 깨진다.
  assert.deepEqual(decide({ lastReadAt: ago(VIEWING_WINDOW_MS / 2) }), {
    send: false,
    reason: "viewing",
  });
});

test("읽은 지 오래됐으면 보고 있는 게 아니다", () => {
  assert.deepEqual(decide({ lastReadAt: ago(VIEWING_WINDOW_MS + 1000) }), { send: true });
});

test("안 읽은 채로 답장이 더 와도 알림은 한 번뿐", () => {
  // 작가가 연달아 보내는 경우 — 첫 알림 뒤로 읽은 적이 없다
  const sent = ago(10 * 60_000);
  assert.deepEqual(decide({ lastSentAt: sent }), { send: false, reason: "cooldown" });
});

test("쿨다운이 지나면 안 읽고 있어도 한 번 더 보낸다", () => {
  const sent = ago(NOTIFY_COOLDOWN_MS + 1000);
  assert.deepEqual(decide({ lastSentAt: sent }), { send: true });
});

test("알림을 받고 읽었으면 쿨다운이 풀린다", () => {
  // 읽고 나간 뒤 온 새 답장은 다시 알려야 한다 — 이게 쿨다운에 묶이면 안 된다
  const sent = ago(3 * 3600_000);
  const read = ago(2 * 3600_000); // 알림 뒤에 읽음
  assert.deepEqual(decide({ lastSentAt: sent, lastReadAt: read }), { send: true });
});

test("알림 전에 읽은 이력은 쿨다운을 풀지 못한다", () => {
  // 읽음 → 알림 순서. 그 알림은 아직 읽히지 않았다
  const read = ago(3 * 3600_000);
  const sent = ago(2 * 3600_000);
  assert.deepEqual(decide({ lastSentAt: sent, lastReadAt: read }), {
    send: false,
    reason: "cooldown",
  });
});

test("보고 있는 판정이 쿨다운 리셋보다 먼저다", () => {
  // 방금 읽었다 = 화면에 떠 있다. 쿨다운이 풀렸더라도 지금 보낼 이유가 없다
  const sent = ago(3 * 3600_000);
  assert.deepEqual(decide({ lastSentAt: sent, lastReadAt: ago(10_000) }), {
    send: false,
    reason: "viewing",
  });
});

test("보고 있는 창의 경계에서는 보낸다", () => {
  assert.deepEqual(decide({ lastReadAt: ago(VIEWING_WINDOW_MS) }), { send: true });
});

test("하트비트 한 번을 걸러도 보고 있는 것으로 남는다", () => {
  // 이 부등식이 깨지면 화면을 보고 있는 사람에게 알림이 날아간다.
  // 하트비트가 한 번 밀리거나 요청이 느려도 버티도록 여유가 있어야 한다.
  assert.ok(
    READ_HEARTBEAT_MS * 1.5 < VIEWING_WINDOW_MS,
    `하트비트(${READ_HEARTBEAT_MS}ms)가 열람창(${VIEWING_WINDOW_MS}ms) 대비 너무 길다`
  );
  assert.deepEqual(decide({ lastReadAt: ago(READ_HEARTBEAT_MS + 5_000) }), {
    send: false,
    reason: "viewing",
  });
});

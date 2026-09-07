// 작가 답장 알림(chat_reply)을 보낼지 말지 — DB·서버 의존이 없는 순수 로직.
//
// 거래 알림(제안·수락·입금·정산)에는 쓰지 않는다. 그쪽은 사건당 1회라 억제 규칙이 단순하고,
// 늦거나 빠지면 거래가 멈춘다. 이 판정은 "소음이 되기 쉬운" 채팅 알림 전용이다.
//
// server-only 를 붙이지 않는 이유는 node:test 에서 로드하기 위해서다.

/**
 * 이 시간 안에 읽은 적 있으면 "지금 보고 있는 중" 으로 본다.
 *
 * 방을 열어두면 상대 메시지가 도착할 때마다 markRead 가 불리므로(ChatRoom.tsx),
 * 대화 중에는 이 값이 계속 갱신된다. 짧게 잡으면 대화 중에도 알림이 새고,
 * 길게 잡으면 앱을 닫은 뒤 온 답장을 놓친다. 2분은 그 사이다.
 */
export const VIEWING_WINDOW_MS = 2 * 60_000;

/** 안 읽은 채로 알림이 또 나가지 않도록 두는 간격. */
export const NOTIFY_COOLDOWN_MS = 24 * 3600_000;

export type ChatNotifyDecision = { send: true } | { send: false; reason: string };

/**
 * 판정 순서가 곧 정책이다.
 *
 *   ① 지금 보고 있으면 보내지 않는다 — 화면에 이미 떠 있는 걸 또 알릴 이유가 없다
 *   ② 직전 알림 뒤로 읽은 적이 없고 24시간이 안 지났으면 보내지 않는다
 *      (읽었으면 쿨다운은 리셋된다 — 읽고 나간 뒤 온 새 답장은 다시 알려야 한다)
 *   ③ 그 외에는 보낸다
 */
export function decideChatReplyNotification(input: {
  /** 고객이 이 방을 마지막으로 읽은 시각 */
  lastReadAt: Date | null;
  /** 이 대화로 마지막에 알림을 보낸 시각 */
  lastSentAt: Date | null;
  now: Date;
}): ChatNotifyDecision {
  const { lastReadAt, lastSentAt, now } = input;

  if (lastReadAt && now.getTime() - lastReadAt.getTime() < VIEWING_WINDOW_MS) {
    return { send: false, reason: "viewing" };
  }

  if (lastSentAt) {
    // 알림을 보낸 뒤에 읽었다면 그 알림은 제 역할을 했다. 쿨다운을 리셋한다.
    const readSinceLastSend = !!lastReadAt && lastReadAt > lastSentAt;
    const withinCooldown = now.getTime() - lastSentAt.getTime() < NOTIFY_COOLDOWN_MS;
    if (!readSinceLastSend && withinCooldown) {
      return { send: false, reason: "cooldown" };
    }
  }

  return { send: true };
}

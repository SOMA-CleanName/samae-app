// 채팅 메시지 알림을 보낼지 말지 — DB·서버 의존이 없는 순수 로직.
//
// **양방향이다.** 작가가 보내면 고객이, 고객이 보내면 작가가 받는다. 판정 규칙은 같다.
//
// 거래 알림(제안·수락·입금·정산)에는 쓰지 않는다. 그쪽은 사건당 1회라 억제 규칙이 단순하고,
// 늦거나 빠지면 거래가 멈춘다. 이 판정은 "소음이 되기 쉬운" 채팅 알림 전용이다.
//
// server-only 를 붙이지 않는 이유는 node:test 에서 로드하기 위해서다.

/**
 * 화면이 열려 있는 동안 `markRead` 를 다시 찍는 간격 (ChatRoom.tsx 하트비트).
 *
 * 이 값이 있어야 아래 열람창을 짧게 잡을 수 있다. 하트비트가 없던 때는 방에 들어올 때와
 * 상대 메시지가 올 때만 찍혀서, **조용히 읽고 있는 사람이 "나간 것" 으로 보였다.**
 * 그 상태로 열람창을 줄이면 보고 있는 사람에게 알림이 날아간다.
 */
export const READ_HEARTBEAT_MS = 10_000;

/**
 * 이 시간 안에 읽은 적 있으면 "지금 보고 있는 중" 으로 본다.
 *
 * 하트비트 간격보다 넉넉해야 한다 — 요청이 한 번 밀리거나 느려도 보고 있는 사람을
 * 나간 것으로 오판하면 안 된다. 반대로 너무 길면 방을 닫고 온 메시지를 그만큼 늦게 알린다.
 * 10초 하트비트 + 10초 여유 = 20초. 탭을 닫거나 백그라운드로 보내면 하트비트가 멈추므로,
 * **최대 20초 뒤부터는 알림이 나간다** — 사실상 "안 보고 있으면 바로" 다.
 *
 * ⚠️ 더 줄이지 말 것. 하트비트 요청이 한 번만 밀려도 화면을 보고 있는 사람이 "나간 것"으로
 *    잡혀 알림이 날아간다. 줄이려면 하트비트를 먼저 줄여야 하는데, 그만큼 DB 쓰기가 늘어난다.
 */
export const VIEWING_WINDOW_MS = 20_000;

/**
 * 안 읽은 채로 알림이 또 나가지 않도록 두는 간격.
 *
 * 12시간인 이유 — 스냅 예약은 날짜가 촉박한 경우가 많아 하루를 통째로 묻어두면 늦다.
 * 12시간이면 아침에 놓친 답장이 저녁에 한 번 더 뜬다.
 *
 * 이 간격은 **대화마다 따로 돈다.** 고정 시각이 아니라 "마지막 알림 시각 + 12시간" 이다.
 * 그 시점에도 안 읽었으면 `/api/cron/chat-reminder` 가 리마인더를 한 번 더 보낸다
 * (같은 판정 함수를 쓰므로 규칙이 갈라지지 않는다).
 */
export const NOTIFY_COOLDOWN_MS = 12 * 3600_000;

export type ChatNotifyDecision = { send: true } | { send: false; reason: string };

/**
 * 판정 순서가 곧 정책이다.
 *
 *   ① 지금 보고 있으면 보내지 않는다 — 화면에 이미 떠 있는 걸 또 알릴 이유가 없다
 *   ② 직전 알림 뒤로 읽은 적이 없고 쿨다운이 안 지났으면 보내지 않는다
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

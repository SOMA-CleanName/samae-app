// 작가 답장 알림(chat_reply)을 보낼지 말지 — DB·서버 의존이 없는 순수 로직.
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
export const READ_HEARTBEAT_MS = 25_000;

/**
 * 이 시간 안에 읽은 적 있으면 "지금 보고 있는 중" 으로 본다.
 *
 * 하트비트 간격보다 넉넉해야 한다 — 요청이 한 번 밀리거나 느려도 보고 있는 사람을
 * 나간 것으로 오판하면 안 된다. 반대로 너무 길면 방을 닫고 온 답장을 그만큼 늦게 알린다.
 * 25초 하트비트 + 15초 여유 = 40초. 탭을 닫거나 백그라운드로 보내면 하트비트가 멈추므로,
 * **최대 40초 뒤부터는 알림이 나간다.**
 */
export const VIEWING_WINDOW_MS = 40_000;

/**
 * 안 읽은 채로 알림이 또 나가지 않도록 두는 간격.
 *
 * 12시간인 이유 — 스냅 예약은 날짜가 촉박한 경우가 많아 하루를 통째로 묻어두면 늦다.
 * 12시간이면 아침에 놓친 답장이 저녁에 한 번 더 뜬다.
 *
 * ⚠️ 이 간격이 지났다고 저절로 알림이 가지는 않는다. 발송 트리거는 **작가의 새 메시지**뿐이다
 * (크론 없음). "12시간 뒤 자동 리마인더" 가 필요하면 별도 배치가 있어야 한다.
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

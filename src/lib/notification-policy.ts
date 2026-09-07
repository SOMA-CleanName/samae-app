// 외부 알림(SMS/알림톡) 발송 정책 — DB·서버 의존이 없는 순수 로직.
//
// 실행기(notification-runner.ts)에서 분리한 이유는 두 가지다.
//   ① "언제 보내고 언제 안 보내는가"가 이 기능의 전부라서 한 곳에 모아두면 읽기 쉽다
//   ② server-only 가 붙은 파일은 node:test 에서 로드되지 않는다
//
// 예약은 notify-user.ts, 발송은 notification-runner.ts, 판정만 여기.

/** 예약 후 이만큼 지나서 발송한다 — 보고 있는 사람이 읽을 시간. */
export const NOTIFY_DELAY_MS = 5 * 60_000;

/** 한 대화에 이 간격보다 자주 보내지 않는다. */
export const NOTIFY_COOLDOWN_MS = 24 * 3600_000;

export type Decision =
  | { action: "skip"; reason: string }
  | { action: "defer"; until: Date }
  | { action: "send" };

/**
 * 발송 직전 판정.
 *
 * 순서가 정책이다:
 *   읽음 확인이 쿨다운보다 먼저다. 읽은 대화를 하루 뒤로 미뤄두면 그 예약이 남아
 *   나중에 엉뚱한 시점에 되살아난다. 읽었으면 그 자리에서 끝낸다.
 */
export function decideNotification(input: {
  /** 대화의 안읽음 수. null 이면 대화가 사라진 것 */
  unread: number | null;
  /** 같은 대화에 마지막으로 보낸 시각 */
  lastSentAt: Date | null;
  phone: string | null;
  now: Date;
  smsAllowed: boolean;
}): Decision {
  const { unread, lastSentAt, phone, now, smsAllowed } = input;

  if (unread === null) return { action: "skip", reason: "conversation_gone" };
  if (unread === 0) return { action: "skip", reason: "read" };

  if (lastSentAt) {
    const until = new Date(lastSentAt.getTime() + NOTIFY_COOLDOWN_MS);
    // 취소가 아니라 연기다 — 계속 안 읽고 있으면 하루 뒤 한 번 더 가야 한다
    if (until > now) return { action: "defer", until };
  }

  if (!phone) return { action: "skip", reason: "no_phone" };
  if (!smsAllowed) return { action: "skip", reason: "dev" };

  return { action: "send" };
}

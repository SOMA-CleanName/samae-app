import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decideChatReplyNotification, NOTIFY_COOLDOWN_MS } from "@/lib/notification-policy";
import {
  loadChatNotifyContext,
  sendChatNotify,
  type ChatNotifySide,
} from "@/lib/notify-user";

// 미열람 리마인더 — "마지막 알림 + 12시간이 지나도 안 읽었으면 한 번 더".
//
// 발송 트리거가 **상대의 새 메시지**뿐이라 생기는 구멍을 메운다. 알림을 한 통 보낸 뒤
// 상대가 조용하면, 받은 사람이 영영 안 읽어도 다시 알릴 방법이 없었다.
//
// 고정 시각이 아니라 **대화마다 시계가 따로 돈다.** 그래서 크론은 주기가 아니라
// **스캐너**다 — 도는 순간마다 "지금 12시간이 지난 대화" 를 찾아 보낸다. 크론 빈도는
// 규칙이 아니라 정밀도를 정한다(매시간이면 12~13시간 사이에 도착).
//
// 판정은 notifyChatMessage 와 **같은 함수**를 쓴다. 규칙이 두 군데로 갈라지면
// "보내는 조건" 과 "다시 보내는 조건" 이 조용히 어긋난다.

/** 한 번에 훑을 대화 수 상한 — 크론 타임아웃 방지. 남으면 다음 회차가 이어받는다. */
const SCAN_LIMIT = 200;

export type ChatReminderResult = {
  ok: boolean;
  scanned: number;
  sent: number;
  error?: string;
};

export async function sendChatReminders(now = new Date()): Promise<ChatReminderResult> {
  try {
    const admin = createAdminClient();
    const cutoff = new Date(now.getTime() - NOTIFY_COOLDOWN_MS).toISOString();

    // 후보 = 쿨다운이 끝난 발송 이력. 여기서 대화·방향을 뽑아 다시 판정한다.
    //
    // notification_queue 를 기준으로 잡는 이유 — "마지막으로 **실제 발송된** 시각" 이
    // 리마인더의 기준이고, 그 진실은 여기에만 있다. conversations 에는 없다.
    // ⚠️ kind 로 거르면 안 된다 — 고객 쪽은 `chat_reply`, 작가 쪽은
    //    `chat_message_to_photographer` 라 한쪽이 통째로 빠진다.
    //    두 방향이 공유하는 건 dedupe_key 접두사(`chat_reply:`)다.
    const { data: rows, error } = await admin
      .from("notification_queue")
      .select("dedupe_key, sent_at")
      .like("dedupe_key", "chat_reply:%")
      .eq("status", "sent")
      .lt("sent_at", cutoff)
      .order("sent_at", { ascending: false })
      .limit(SCAN_LIMIT * 4); // 같은 대화의 옛 행이 섞이므로 넉넉히 받아 아래서 최신만 남긴다
    if (error) return { ok: false, scanned: 0, sent: 0, error: error.message };

    // dedupe_key 당 가장 최근 발송만 남긴다(위에서 내림차순이라 첫 등장이 최신).
    const latest = new Map<string, string>();
    for (const r of rows ?? []) {
      const key = r.dedupe_key as string;
      if (!latest.has(key)) latest.set(key, r.sent_at as string);
    }

    let scanned = 0;
    let sent = 0;

    for (const [key, sentAt] of [...latest].slice(0, SCAN_LIMIT)) {
      // `chat_reply:{conversationId}:{side}` — side 가 없으면 양방향 이전의 옛 행이다.
      const parts = key.split(":");
      if (parts.length !== 3) continue;
      const [, conversationId, side] = parts as [string, string, ChatNotifySide];
      if (side !== "user" && side !== "photographer") continue;

      scanned += 1;
      const ctx = await loadChatNotifyContext(conversationId);
      if (!ctx) continue; // 대화가 지워졌다

      const readAt = side === "user" ? ctx.userReadAt : ctx.photographerReadAt;
      const decision = decideChatReplyNotification({
        lastReadAt: readAt ? new Date(readAt) : null,
        lastSentAt: new Date(sentAt),
        now,
      });
      // 읽었으면 read 가 lastSent 보다 뒤라 쿨다운이 풀리고 send:true 가 된다 —
      // 그건 리마인더 대상이 아니다. **안 읽은 채로 12시간이 지난 것만** 보낸다.
      if (!decision.send) continue;
      if (readAt && new Date(readAt) > new Date(sentAt)) continue;

      await sendChatNotify(ctx, side);
      sent += 1;
    }

    return { ok: true, scanned, sent };
  } catch (err) {
    return {
      ok: false,
      scanned: 0,
      sent: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

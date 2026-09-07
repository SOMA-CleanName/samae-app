import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverQueued } from "@/lib/notify-dispatch";
import { decideNotification } from "@/lib/notification-policy";
import type { NotifyKind, NotifyVariables } from "@/lib/notify-templates";

// 예약 알림 실행기 — 크론 5분 간격 (/api/cron/notify-queue).
//
// 예약을 넣는 건 notify-user.ts(chat_reply), 실제 발송은 notify-dispatch.ts 의 deliverQueued.
// 여기는 "지금 보낼 때가 된" 건을 훑어 발송 직전에 두 가지를 다시 보는 층이다:
//   ① 그 사이 읽었는가        → 읽었으면 보내지 않는다 (채팅방을 열어둔 경우가 여기서 걸린다)
//   ② 최근에 보낸 적 있는가   → 24시간 안이면 "마지막 발송 + 24h" 로 미룬다
//
// ②가 취소가 아니라 연기인 것이 핵심이다. 계속 안 읽고 있으면 하루 뒤 한 번 더 가야 한다.
// 취소해 버리면 그 사이 쌓인 답장이 영영 안 알려진다.
//
// 거래 알림(예약·입금·정산)은 scheduled_at 없이 즉시 나가므로 여기 걸리지 않는다.

/** 한 번 실행에 처리할 최대 건수 — 크론이 5분마다 도니 밀려도 다음 회차에 따라온다. */
const BATCH_LIMIT = 200;

export type RunResult = {
  ok: boolean;
  picked: number;
  sent: number;
  skipped: number;
  deferred: number;
  failed: number;
  error?: string;
};

function sendingAllowed(): boolean {
  return process.env.NODE_ENV === "production" || process.env.NOTIFY_SMS_DEV === "on";
}

export async function runNotificationQueue(now: Date = new Date()): Promise<RunResult> {
  const result: RunResult = { ok: true, picked: 0, sent: 0, skipped: 0, deferred: 0, failed: 0 };

  try {
    const admin = createAdminClient();

    const { data: due, error } = await admin
      .from("notification_queue")
      .select("id, kind, conversation_id, phone, body, dedupe_key, variables")
      .eq("status", "pending")
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", now.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(BATCH_LIMIT);

    if (error) return { ...result, ok: false, error: error.message };
    result.picked = due?.length ?? 0;

    for (const row of due ?? []) {
      // ① 그 사이 읽었는가
      let unread: number | null = 1;
      if (row.conversation_id) {
        const { data: conv } = await admin
          .from("conversations")
          .select("user_unread")
          .eq("id", row.conversation_id)
          .maybeSingle();
        unread = conv ? (conv.user_unread as number) : null;
      }

      // ② 같은 사건에 마지막으로 보낸 시각
      const { data: last } = await admin
        .from("notification_queue")
        .select("sent_at")
        .eq("dedupe_key", row.dedupe_key)
        .eq("status", "sent")
        .not("sent_at", "is", null)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const decision = decideNotification({
        unread,
        lastSentAt: last?.sent_at ? new Date(last.sent_at) : null,
        phone: row.phone,
        now,
        smsAllowed: sendingAllowed(),
      });

      if (decision.action === "skip") {
        await admin
          .from("notification_queue")
          .update({ status: "skipped", error: decision.reason })
          .eq("id", row.id);
        result.skipped++;
        continue;
      }

      if (decision.action === "defer") {
        await admin
          .from("notification_queue")
          .update({ scheduled_at: decision.until.toISOString() })
          .eq("id", row.id);
        result.deferred++;
        continue;
      }

      // 발송은 즉시 발송분과 같은 경로를 탄다 — 채널 선택·폴백·기록이 어긋나면 안 된다
      const res = await deliverQueued({
        queueId: row.id,
        kind: row.kind as NotifyKind,
        phone: row.phone,
        body: row.body,
        variables: (row.variables ?? {}) as NotifyVariables,
      });

      if (res === "sent") result.sent++;
      else if (res === "failed") result.failed++;
      else result.skipped++;
    }

    return result;
  } catch (err) {
    return { ...result, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

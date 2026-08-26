import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms";

// 사용자 재소환 알림 (서비스 밖 채널) — 현재 SMS, 사업자 후 알림톡으로 교체 예정.
// 설계(챗봇_설계 §5): 호출부는 큐에 넣기만 하고, 발송·중복 억제·이력은 여기서 책임진다.
//
// 발송 정책 (chat_reply):
//   · 작가가 보낸 메시지로 사용자 안읽음이 0→1 이 된 순간에만 (밀린 안읽음에 연타 금지)
//   · 대화당 쿨다운 4시간 — 작가가 연속으로 여러 줄을 보내도 문자는 1통
//   · dev 에서는 NOTIFY_SMS_DEV=on 일 때만 실발송 (그 외엔 큐에 skipped 로 기록)

const CHAT_REPLY_COOLDOWN_MS = 4 * 3600_000;

function smsAllowed(): boolean {
  return process.env.NODE_ENV === "production" || process.env.NOTIFY_SMS_DEV === "on";
}

function chatLink(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://samae.co.kr";
  return `${base.replace(/\/$/, "")}/chat`;
}

/** 작가 답장 → 사용자 SMS 재소환. 메시지 insert 성공 직후 호출 (실패해도 채팅 흐름은 계속). */
export async function notifyUserOfPhotographerReply(
  conversationId: string,
  senderProfileId: string
): Promise<void> {
  try {
    const admin = createAdminClient();

    // 대화·발신자 검증 — 이 대화의 작가가 보낸 게 맞을 때만
    const { data: conv } = await admin
      .from("conversations")
      .select("id, user_id, photographer_id, user_unread")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv) return;
    const { data: photographer } = await admin
      .from("photographers")
      .select("id, profile_id, display_name")
      .eq("id", conv.photographer_id)
      .maybeSingle();
    if (!photographer || photographer.profile_id !== senderProfileId) return; // 사용자 발신이면 무시

    // 안읽음 0→1 순간에만 — 트리거(0004)가 insert 와 같은 트랜잭션에서 +1 하므로
    // 이 시점의 user_unread=1 은 "방금 그 메시지가 첫 안읽음"이라는 뜻
    if ((conv.user_unread as number) !== 1) return;

    const dedupeKey = `chat_reply:${conversationId}`;

    // 쿨다운 — 4시간 내 발송(sent) 이력이 있으면 스킵
    const { data: recent } = await admin
      .from("notification_queue")
      .select("id")
      .eq("dedupe_key", dedupeKey)
      .eq("status", "sent")
      .gte("created_at", new Date(Date.now() - CHAT_REPLY_COOLDOWN_MS).toISOString())
      .limit(1)
      .maybeSingle();
    if (recent) return;

    const { data: profile } = await admin
      .from("profiles")
      .select("phone")
      .eq("id", conv.user_id)
      .maybeSingle();

    const body = `[사매] ${photographer.display_name ?? "작가"}님 답장이 도착했어요. 확인: ${chatLink()}`;

    // 큐 기록 먼저 (감사 로그) → 발송 → 상태 갱신
    const { data: queued } = await admin
      .from("notification_queue")
      .insert({
        kind: "chat_reply",
        profile_id: conv.user_id,
        phone: profile?.phone ?? null,
        body,
        dedupe_key: dedupeKey,
        status: "pending",
      })
      .select("id")
      .single();
    if (!queued) return;

    const finish = (status: string, error?: string) =>
      admin
        .from("notification_queue")
        .update({ status, error: error ?? null, sent_at: status === "sent" ? new Date().toISOString() : null })
        .eq("id", queued.id);

    if (!profile?.phone) {
      await finish("skipped", "no_phone");
      return;
    }
    if (!smsAllowed()) {
      await finish("skipped", "dev");
      return;
    }

    const res = await sendSms(profile.phone, body);
    await finish(res.ok ? "sent" : "failed", res.ok ? undefined : res.error);
  } catch (err) {
    // 알림 실패가 채팅을 막으면 안 된다 — 로그만
    console.error("[notify] chat_reply 실패:", err instanceof Error ? err.message : err);
  }
}

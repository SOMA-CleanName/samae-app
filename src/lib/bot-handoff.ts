import "server-only";

// 작가 인계(handoff) — "작가가 대응을 시작하면 챗봇은 비활성화되며 다시 활성화되지 않는다."
//
// 기존에는 이 판정을 매 턴 messages 이력에서 파생했다(작가발 text/image 존재 여부).
// 그래서 (a) 인계 안내를 정확히 한 번만 띄우기 어려웠고 (b) "다시 켜지지 않는다"가
// 이력 해석에 의존했다. 이제 conversations.bot_disabled_at 에 못을 박는다 — 단방향이다.
//
// 봇이 못 답한 질문(bot_open_questions)도 여기서 다룬다. 봇이 모른다고 넘긴 질문은
// 사라지지 않고 남아서, 작가가 방에 들어왔을 때 무엇에 답해야 하는지 알 수 있어야 한다.

import type { createAdminClient } from "@/lib/supabase/admin";
import { BOT_HANDOFF_NOTICE } from "./bot-identity";
import { fetchBotSettings, renderBotMessage } from "./bot-settings";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * 작가가 이 방에서 발화했다 → 봇 영구 정지 + 인계 안내 1회 게시.
 * 이미 정지된 방이면 아무것도 하지 않는다(멱등).
 *
 * ⚠️ 반드시 **작가 메시지를 넣기 전에** 호출한다 — 안내가 작가 첫 마디보다 뒤에 붙으면
 * "봇이 물러나고 작가가 들어왔다" 는 순서가 화면에서 뒤집힌다.
 *
 * 안내를 `system` 이 아니라 `bot` 타입으로 넣는 이유:
 *   (1) 요구사항상 **챗봇이** 작가의 입장을 알리는 주체다 (봇 아바타로 렌더된다)
 *   (2) on_message_insert 트리거가 `bot` 은 타임라인만 갱신한다 —
 *       뒤따르는 작가 실제 메시지가 알림·안읽음을 만들므로 중복 알림이 생기지 않는다
 */
export async function disableBotForPhotographerReply(
  admin: Admin,
  conversationId: string,
  photographerProfileId: string,
  /** 운영이 어드민에서 고친 인계 문구 (없으면 코드 기본) */
  notice = BOT_HANDOFF_NOTICE
): Promise<{ justDisabled: boolean }> {
  const now = new Date().toISOString();
  // 조건부 업데이트 자체가 잠금 역할 — 작가가 동시에 두 통 보내도 안내는 한 번만 나간다
  const { data: updated } = await admin
    .from("conversations")
    .update({ bot_disabled_at: now, bot_handoff_notified_at: now })
    .eq("id", conversationId)
    .is("bot_disabled_at", null)
    .select("id");
  if (!updated || updated.length === 0) return { justDisabled: false };

  await admin.from("messages").insert({
    conversation_id: conversationId,
    sender_id: photographerProfileId,
    type: "bot",
    body: notice,
  });
  return { justDisabled: true };
}

/**
 * 작가가 이 방에 무언가를 보냈다(텍스트·사진) → 인계 처리 한 번.
 * 발신자가 작가인지 여기서 판정하므로 호출부는 그냥 넘기면 된다.
 * **메시지를 넣기 전에** 부르고, 실패해도 전송을 막지 않는다.
 */
export async function handlePhotographerTakeover(
  admin: Admin,
  conversationId: string,
  senderId: string
): Promise<void> {
  try {
    const { data: conv } = await admin
      .from("conversations")
      .select(
        "id, user_id, photographer_id, bot_disabled_at, photographer:photographers(profile_id, display_name)"
      )
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv || conv.user_id === senderId) return; // 고객 발신 — 인계 아님
    if (conv.bot_disabled_at) return; // 이미 인계됨
    type Ph = { profile_id: string | null; display_name: string | null };
    const raw = conv.photographer as Ph | Ph[] | null;
    const ph = Array.isArray(raw) ? raw[0] : raw;
    const settings = await fetchBotSettings();
    const notice = renderBotMessage(settings.messages.handoff, ph?.display_name ?? "작가");
    await disableBotForPhotographerReply(admin, conversationId, ph?.profile_id ?? senderId, notice);
    await closeOpenQuestions(admin, conversationId);
  } catch (err) {
    console.error("[bot-handoff] 인계 처리 실패:", err instanceof Error ? err.message : err);
  }
}

/** 봇이 KB 로 답하지 못해 작가에게 넘긴 질문을 남긴다 (실패해도 대화는 계속) */
export async function recordOpenQuestion(
  admin: Admin,
  args: { conversationId: string; photographerId: string; question: string }
): Promise<void> {
  const q = args.question.trim().slice(0, 500);
  if (!q) return;
  try {
    await admin.from("bot_open_questions").insert({
      conversation_id: args.conversationId,
      photographer_id: args.photographerId,
      question: q,
    });
  } catch (err) {
    console.error("[bot-handoff] 미답변 질문 기록 실패:", err instanceof Error ? err.message : err);
  }
}

/** 작가가 답하기 시작하면 그 방의 미답변 질문을 닫는다 (작가 대시보드 큐 정리용) */
export async function closeOpenQuestions(admin: Admin, conversationId: string): Promise<void> {
  try {
    await admin
      .from("bot_open_questions")
      .update({ answered_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .is("answered_at", null);
  } catch {
    /* 큐 정리 실패는 대화를 막지 않는다 */
  }
}

/** 이 방의 미답변 질문 (작가에게 "이건 아직 답을 못 드렸어요" 로 보여준다) */
export async function listOpenQuestions(
  admin: Admin,
  conversationId: string
): Promise<{ id: string; question: string; created_at: string }[]> {
  const { data } = await admin
    .from("bot_open_questions")
    .select("id, question, created_at")
    .eq("conversation_id", conversationId)
    .is("answered_at", null)
    .order("created_at", { ascending: true });
  return (data ?? []) as { id: string; question: string; created_at: string }[];
}

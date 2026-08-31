import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BotChatMessage } from "@/lib/inquiry-bot-llm";

// 챗봇 대화의 채팅 승격 (C3 본구현) — 문의 완료 시:
//   1) user↔photographer 대화방 생성/재사용
//   2) 봇 수집 대화 전체를 messages(type='bot')로 저장 — sender 로 화자 구분
//      (봇 발화 = 작가 프로필 명의: 봇은 "작가 대신 묻는 도우미"라는 컨셉 그대로)
//   3) 문의 요약 카드(type='summary_card', body=JSON) 게시 → 트리거가 작가에게 "새 문의" 알림
// 실패해도 문의 접수(inquiries)는 이미 성공한 상태 — 채팅 승격은 부가 경로라 로그만 남긴다.

export type BotInquirySummary = {
  inquiryId: string;
  photoId: string | null;
  purpose: string;
  preferredDate: string;
  region: string;
  partySize: string | null;
  note: string | null;
};

export async function promoteBotInquiryToChat(params: {
  userId: string;
  photographerId: string;
  transcript: BotChatMessage[];
  summary: BotInquirySummary;
}): Promise<string | null> {
  try {
    const admin = createAdminClient();

    const { data: photographer } = await admin
      .from("photographers")
      .select("id, profile_id")
      .eq("id", params.photographerId)
      .maybeSingle();
    if (!photographer) return null;

    // 방 재사용/생성 (user↔photographer 1:1)
    let { data: conv } = await admin
      .from("conversations")
      .select("id")
      .eq("user_id", params.userId)
      .eq("photographer_id", params.photographerId)
      .maybeSingle();
    if (!conv) {
      ({ data: conv } = await admin
        .from("conversations")
        .insert({ user_id: params.userId, photographer_id: params.photographerId })
        .select("id")
        .single());
    }
    if (!conv) return null;
    const conversationId = conv.id as string;

    // 같은 문의의 중복 승격 방지 (연타·재제출 시 legacy 가 리드를 재사용하는 경우)
    const { data: dup } = await admin
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("type", "summary_card")
      .like("body", `%${params.summary.inquiryId}%`)
      .limit(1)
      .maybeSingle();
    if (dup) return conversationId;

    // 대화가 실시간 동기화(appendBotTurns)로 이미 방에 있으면 배치 저장 생략 (중복 방지).
    // 폴백 버튼 플로우 등 동기화가 없던 대화만 여기서 일괄 승격한다.
    const { count: existingBot } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("type", "bot");

    // 대화 이력 — created_at 을 과거에서 현재로 1초 간격 배치해 순서를 고정
    const turns =
      (existingBot ?? 0) > 0 ? [] : params.transcript.filter((t) => t.text.trim().length > 0);
    const base = Date.now() - (turns.length + 1) * 1000;
    if (turns.length > 0) {
      const rows = turns.map((t, i) => ({
        conversation_id: conversationId,
        sender_id: t.role === "user" ? params.userId : photographer.profile_id,
        type: "bot" as const,
        body: t.text,
        created_at: new Date(base + i * 1000).toISOString(),
      }));
      const { error } = await admin.from("messages").insert(rows);
      if (error) console.error("[bot-chat] 대화 승격 실패:", error.message);
    }

    // 요약 카드 — 트리거가 작가 안읽음 +1 + "새 문의" 알림을 만든다
    const { error: cardErr } = await admin.from("messages").insert({
      conversation_id: conversationId,
      sender_id: params.userId,
      type: "summary_card",
      body: JSON.stringify(params.summary),
    });
    if (cardErr) console.error("[bot-chat] 요약 카드 실패:", cardErr.message);

    return conversationId;
  } catch (err) {
    console.error("[bot-chat] 승격 오류:", err instanceof Error ? err.message : err);
    return null;
  }
}

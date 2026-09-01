"use server";

// 채팅방 상주 봇 — 고객이 /chat/[id] 에서 보낸 발화를 봇이 그 방 안에서 받아 답한다.
// 규칙 자체는 lib/bot-turn.ts 에 있다. 여기서는 **말하는 사람이 본인인지**만 확인한다.

import { getCurrentUser } from "@/lib/auth";
import { runBotTurn } from "@/lib/bot-turn";
import type { BotTurnResult } from "@/lib/bot-turn";

export type { BotTurnResult };

export async function sendBotTurn(conversationId: string, body: string): Promise<BotTurnResult> {
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요합니다.");
  return runBotTurn(conversationId, body, me.id);
}

"use server";

// 채팅방 상주 봇 — 고객이 /chat/[id] 에서 보낸 발화를 봇이 그 방 안에서 받아 응답한다.
// (봇 페이지 분리 구조 폐지 — 작가와 봇이 같은 방을 쓴다)
//
// 한 턴의 흐름:
//   검열 → 사용자 발화 저장 → DB 이력·슬롯 로드 → LLM (작가 개입 시 조용한 추출만)
//   → 봇 응답 저장(개입 전) → bot_slots 갱신 → 수집 완주면 자동 접수(요약 카드)

import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectOffPlatform, MODERATION_NOTICE } from "@/lib/moderation";
import {
  coreSlotsFilled,
  type AskingKey,
  type LlmSlots,
} from "@/lib/inquiry-bot-llm";
import {
  mapDbMessagesToBotHistory,
  runBotLlmTurn,
  type BotPhotoContext,
} from "@/lib/inquiry-bot-room";
import { fetchPhotographerScript } from "@/lib/photographer-scripts-db";
import { notifyPhotographer } from "@/lib/inquiry-bot-notify";
import { finalizeBotInquiryFor } from "@/app/(user)/inquiry/actions";

export type BotTurnResult =
  | { ok: false; blocked: true; reason: string }
  | {
      ok: true;
      /** 봇이 이 턴에 응답을 남겼는지 (작가 개입 후엔 false — 조용한 추출만) */
      replied: boolean;
      asking: AskingKey;
      quickReplies: string[];
      /** 수집 완주 → 접수까지 끝남 (요약 카드 게시됨) */
      done: boolean;
      /** 완주했지만 프로필에 번호가 없어 접수 보류 — 연락처 등록 필요 */
      needContact?: boolean;
    };

// 대화·발화 상한 (봇 페이지와 동일 수준의 폭주 가드)
const MAX_TURN_CHARS = 2000;
const HISTORY_LIMIT = 60;

export async function sendBotTurn(conversationId: string, body: string): Promise<BotTurnResult> {
  const text = body.trim().slice(0, MAX_TURN_CHARS);
  if (!text) return { ok: true, replied: false, asking: "none", quickReplies: [], done: false };
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요합니다.");

  const admin = createAdminClient();
  const { data: conv } = await admin
    .from("conversations")
    .select("id, user_id, photographer_id, bot_photo_id, bot_slots")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv || conv.user_id !== me.id) throw new Error("권한이 없습니다."); // 고객 본인만

  // 오프플랫폼(연락처·SNS·계좌) 검열 — 봇 수집 대화도 작가에게 보이므로 동일하게 차단
  const matched = detectOffPlatform(text);
  if (matched.length > 0) {
    try {
      await admin.from("moderation_events").insert({
        conversation_id: conversationId,
        sender_id: me.id,
        sender_role: "customer",
        body: text,
        matched,
      });
    } catch (err) {
      console.error("[moderation] 기록 실패:", err instanceof Error ? err.message : err);
    }
    return { ok: false, blocked: true, reason: MODERATION_NOTICE };
  }

  const [{ data: ph }, { data: rows }] = await Promise.all([
    admin
      .from("photographers")
      .select("profile_id, display_name")
      .eq("id", conv.photographer_id)
      .single(),
    admin
      .from("messages")
      .select("sender_id, type, body")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(HISTORY_LIMIT),
  ]);
  if (!ph) throw new Error("작가를 찾을 수 없습니다.");

  const { history, intervened } = mapDbMessagesToBotHistory(rows ?? [], me.id);
  const isFirstUserTurn = !history.some((m) => m.role === "user");

  // 사용자 발화 저장 — 개입 전엔 수집 대화(type='bot', 무알림), 개입 후엔 일반 채팅(작가 알림)
  const { error: insErr } = await admin.from("messages").insert({
    conversation_id: conversationId,
    sender_id: me.id,
    type: intervened ? "text" : "bot",
    body: text,
  });
  if (insErr) throw new Error(insErr.message);

  const slots: LlmSlots =
    conv.bot_slots && typeof conv.bot_slots === "object" ? (conv.bot_slots as LlmSlots) : {};

  // 사진 컨텍스트 — 무드·가격을 시스템 프롬프트에 주입
  let photoContext: BotPhotoContext | null = null;
  if (conv.bot_photo_id) {
    const { data: photo } = await admin
      .from("photos")
      .select("mood_tags, price_krw")
      .eq("id", conv.bot_photo_id)
      .maybeSingle();
    if (photo)
      photoContext = { moodTags: photo.mood_tags ?? [], priceKrw: photo.price_krw ?? null };
  }

  const script = await fetchPhotographerScript(conv.photographer_id);
  const photographerName = ph.display_name ?? "작가";

  let turn;
  try {
    turn = await runBotLlmTurn({
      photographerName,
      script,
      messages: [...history, { role: "user", text }],
      slots,
      photoContext,
    });
  } catch (e) {
    console.error("[bot-room] LLM 실패:", e instanceof Error ? e.message : e);
    // LLM 실패 — 발화는 이미 남았다. 봇이 침묵하는 대신 정직한 안내 한 줄 (개입 전만).
    if (!intervened) {
      await admin.from("messages").insert({
        conversation_id: conversationId,
        sender_id: ph.profile_id,
        type: "bot",
        body: "잠시 연결이 원활하지 않아요. 남겨주신 내용은 그대로 전달되니, 이어서 편하게 적어주세요.",
      });
    }
    return { ok: true, replied: !intervened, asking: "none", quickReplies: [], done: false };
  }

  // 슬롯 저장 — 작가 체크리스트가 실시간으로 차오른다
  await admin.from("conversations").update({ bot_slots: turn.slots }).eq("id", conversationId);

  // 봇 응답 — 작가 개입 전에만 게시 (개입 후엔 조용한 추출: 작가 대화를 방해하지 않는다)
  if (!intervened) {
    await admin.from("messages").insert({
      conversation_id: conversationId,
      sender_id: ph.profile_id,
      type: "bot",
      body: turn.reply,
    });
  }

  // 첫 실제 발화 — 작가에게 "챗봇 문의 진행 중" 알림 (방당 자연 dedupe: 첫 턴에만)
  if (isFirstUserTurn && !intervened) {
    await notifyPhotographer({
      event: "bot_inquiry_started",
      photographerId: conv.photographer_id,
      photographerName,
      photoId: conv.bot_photo_id ?? undefined,
    });
  }

  // 수집 완주 → 자동 접수 (채팅방 진입 자체가 문의 의사 — 별도 보내기 버튼 없음).
  //   · 봇 주도(개입 전): LLM 이 done 을 선언했을 때
  //   · 작가 개입 후: 커스텀 질문을 기다리지 않고 코어 4슬롯이 차는 즉시 접수
  //     (봇이 멈춰 있어 done 신호가 영영 안 올 수 있다 — 4/4면 정리는 충분하다)
  const shouldFinalize = coreSlotsFilled(turn.slots) && (turn.done || intervened);
  if (shouldFinalize) {
    const result = await finalizeBotInquiryFor({
      customerId: me.id,
      photographerId: conv.photographer_id,
      photoId: conv.bot_photo_id ?? null,
      slots: turn.slots,
      notifyPhotographerFlag: !intervened, // 개입한 작가는 이미 보고 있다 — 알림 생략
    });
    if (!result.ok) {
      // 연락처 미등록 등 — 접수 보류
      return {
        ok: true,
        replied: !intervened,
        asking: turn.asking,
        quickReplies: [],
        done: false,
        needContact: true,
      };
    }
    return { ok: true, replied: !intervened, asking: "none", quickReplies: [], done: true };
  }

  return {
    ok: true,
    replied: !intervened,
    asking: turn.asking,
    quickReplies: intervened ? [] : turn.quickReplies,
    done: false,
  };
}

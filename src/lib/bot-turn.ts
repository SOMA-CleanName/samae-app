import "server-only";

// 채팅방 상주 봇의 한 턴 — 누가 부르든 같은 규칙으로 돈다.
//
// 서버 액션(bot-actions.ts)에서 분리한 이유: 어드민 시뮬레이터도 이 로직을 그대로 써야
// 하는데, "use server" 파일의 export 는 전부 외부에서 호출 가능한 엔드포인트가 된다.
// customerId 를 인자로 받는 함수를 거기 두면 아무나 남의 id 로 부를 수 있다.
// 권한 확인은 호출부(액션)가 하고, 여기서는 규칙만 돌린다.
import { createAdminClient } from "@/lib/supabase/admin";
import { detectOffPlatform, MODERATION_NOTICE } from "@/lib/moderation";
import { type AskingKey } from "@/lib/inquiry-bot-llm";
import { mapDbMessagesToBotHistory, runBotQaTurn } from "@/lib/inquiry-bot-room";
import { fetchPhotographerKb } from "@/lib/bot-kb-db";
import { recordOpenQuestion } from "@/lib/bot-handoff";
import { fetchBotSettings, renderBotMessage } from "@/lib/bot-settings";
import { fetchPhotographerTone } from "@/lib/photographer-scripts-db";
import { notifyPhotographer } from "@/lib/inquiry-bot-notify";

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

export async function runBotTurn(
  conversationId: string,
  body: string,
  /** 이 턴을 말하는 고객. 호출부가 본인임을 이미 확인했어야 한다. */
  customerId: string
): Promise<BotTurnResult> {
  const text = body.trim().slice(0, MAX_TURN_CHARS);
  if (!text) return { ok: true, replied: false, asking: "none", quickReplies: [], done: false };

  const admin = createAdminClient();
  const { data: conv } = await admin
    .from("conversations")
    .select("id, user_id, photographer_id, bot_photo_id, bot_slots, bot_disabled_at")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv || conv.user_id !== customerId) throw new Error("권한이 없습니다."); // 고객 본인만

  // 오프플랫폼(연락처·SNS·계좌) 검열 — 봇 수집 대화도 작가에게 보이므로 동일하게 차단
  const matched = detectOffPlatform(text);
  if (matched.length > 0) {
    try {
      await admin.from("moderation_events").insert({
        conversation_id: conversationId,
        sender_id: customerId,
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

  // 인계 판정 — conversations.bot_disabled_at 이 진실이다(단방향).
  // 이력 파생(mapDbMessagesToBotHistory)은 컬럼이 아직 안 찍힌 구방(0097 이전 방)에 대한 폴백.
  const mapped = mapDbMessagesToBotHistory(rows ?? [], customerId);
  const history = mapped.history;
  const intervened = conv.bot_disabled_at != null || mapped.intervened;
  const isFirstUserTurn = !history.some((m) => m.role === "user");

  // 사용자 발화 저장 — 개입 전엔 수집 대화(type='bot', 무알림), 개입 후엔 일반 채팅(작가 알림)
  const { error: insErr } = await admin.from("messages").insert({
    conversation_id: conversationId,
    sender_id: customerId,
    type: intervened ? "text" : "bot",
    body: text,
  });
  if (insErr) throw new Error(insErr.message);

  const photographerName0 = ph.display_name ?? "작가";

  // ── 답변 전용 봇 ────────────────────────────────────────────────
  // 이 방의 봇은 **묻지 않는다.** 촬영 정보 수집은 숨고형 예약 폼(/inquiry)이 맡고,
  // 채팅방 봇은 작가가 자리를 비운 동안 KB 로 답만 한다. (수집 LLM 턴은 여기서 폐지)
  if (intervened) {
    // 작가가 이어받은 방 — 봇은 다시 발화하지 않는다. 고객 발화는 위에서 이미 text 로 저장됐다.
    return { ok: true, replied: false, asking: "none", quickReplies: [], done: false };
  }

  const [settings, kb] = await Promise.all([
    fetchBotSettings(),
    fetchPhotographerKb(conv.photographer_id, photographerName0),
  ]);

  // KB 가 없거나 전역 킬스위치가 내려가 있으면 답할 근거가 없다 —
  // 지어내지 않고 작가에게 넘기고 질문을 남긴다. (킬스위치는 사고 시 배포 없이 봇을 세우는 수단)
  if (!kb || !settings.enabled) {
    await admin.from("messages").insert({
      conversation_id: conversationId,
      sender_id: ph.profile_id,
      type: "bot",
      body: renderBotMessage(settings.messages.noAnswer, photographerName0),
    });
    await recordOpenQuestion(admin, {
      conversationId,
      photographerId: conv.photographer_id,
      question: text,
    });
    if (isFirstUserTurn) {
      await notifyPhotographer({
        event: "bot_inquiry_started",
        photographerId: conv.photographer_id,
        photographerName: photographerName0,
        photoId: conv.bot_photo_id ?? undefined,
      });
    }
    return { ok: true, replied: true, asking: "none", quickReplies: [], done: false };
  }

  // 작가가 스튜디오에서 정한 말투 — 비어 있으면 전역 기본 말투로 내려간다
  const tone = await fetchPhotographerTone(conv.photographer_id);

  let qa;
  try {
    qa = await runBotQaTurn({
      kb,
      messages: [...history, { role: "user", text }],
      settings,
      tone,
    });
  } catch (e) {
    console.error("[bot-kb] LLM 실패:", e instanceof Error ? e.message : e);
    await admin.from("messages").insert({
      conversation_id: conversationId,
      sender_id: ph.profile_id,
      type: "bot",
      body: renderBotMessage(settings.messages.error, photographerName0),
    });
    return { ok: true, replied: true, asking: "none", quickReplies: [], done: false };
  }

  await admin.from("messages").insert({
    conversation_id: conversationId,
    sender_id: ph.profile_id,
    type: "bot",
    body: qa.reply,
  });
  // 봇이 근거 없이 답하지 않고 작가에게 넘긴 질문은 남긴다 —
  // 작가가 방에 들어왔을 때 "무엇에 답해야 하는지" 를 알 수 있어야 한다.
  if (qa.needsHuman) {
    await recordOpenQuestion(admin, {
      conversationId,
      photographerId: conv.photographer_id,
      question: text,
    });
  }
  if (isFirstUserTurn) {
    await notifyPhotographer({
      event: "bot_inquiry_started",
      photographerId: conv.photographer_id,
      photographerName: photographerName0,
      photoId: conv.bot_photo_id ?? undefined,
    });
  }

  return {
    ok: true,
    replied: true,
    asking: "none",
    quickReplies: qa.suggestions,
    done: false,
  };
}

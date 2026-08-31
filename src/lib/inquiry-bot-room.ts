import "server-only";

// 채팅방 상주 봇 — 봇이 별도 페이지가 아니라 **그 채팅방(/chat/[id]) 안에서** 응답하기 위한
// 서버 로직 모음. DB(messages·conversations.bot_slots)가 유일한 진실이다.
//
//   · runBotLlmTurn: LLM 한 턴 (기존 /api/inquiry-bot 라우트에서 추출 — 라우트도 이걸 쓴다)
//   · mapDbMessagesToBotHistory: DB 메시지 → LLM 대화 이력 (작가 개입 감지 포함)
//   · seedBotRoomMessages: 방 생성 직후 봇 인사·첫 질문 시드 (+ 문의 사진)
//
// 접수(finalize)는 submitInquiry 재사용이 필요해 app 레이어(chat/bot-actions.ts)에 있다.

import { z } from "zod";
import { ChatAnthropic } from "@langchain/anthropic";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import {
  CORE_SLOT_KEYS,
  botTurnSchema,
  buildSystemPrompt,
  enforceQuestionBudget,
  sanitizeBotTurn,
  type BotChatMessage,
  type BotTurnClean,
  type LlmSlots,
} from "./inquiry-bot-llm";
import type { PhotographerScript } from "./photographer-scripts";
import {
  buildQaPrompt,
  kbGreeting,
  degradeToHandoff,
  validateGrounding,
  type PhotographerKb,
  type QaTurn,
} from "./bot-kb";
import { createAdminClient } from "@/lib/supabase/admin";

// haiku — 문의 접수는 슬롯 채우기 중심의 좁은 태스크라 소형 모델로 충분 (비용·지연 최소화)
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

/**
 * 모델 클라이언트 공통 옵션.
 *
 * identity-linked API 키는 요청마다 워크스페이스를 지정해야 한다 — 헤더가 없으면
 * 400 으로 떨어지고, 봇은 매 턴 에러 문구만 뱉는다(원인이 화면에 안 드러나 찾기 어렵다).
 * 일반 워크스페이스 키를 쓰면 이 값은 비워두면 되고, 그때는 헤더를 붙이지 않는다.
 */
function anthropicClientOptions() {
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return workspaceId
    ? { clientOptions: { defaultHeaders: { "anthropic-workspace-id": workspaceId } } }
    : {};
}

// 대화 시작 신호 — Anthropic 은 user 턴으로 시작해야 하므로, 봇이 먼저 인사하는
// 우리 플로우에서는 입장 이벤트를 첫 user 턴으로 넣는다.
const ENTER_EVENT = "(사용자가 문의 채팅방에 입장했습니다. 인사하고 첫 질문을 시작하세요.)";

export type BotPhotoContext = { moodTags?: string[]; priceKrw?: number | null };

function toLangChainMessages(
  messages: BotChatMessage[],
  slots: LlmSlots,
  imageDataUrls: string[] = [],
  totalImages = 0
): BaseMessage[] {
  const out: BaseMessage[] = [];
  for (const m of messages) {
    if (m.role === "user") out.push(new HumanMessage(m.text));
    else if (m.role === "bot") out.push(new AIMessage(m.text));
    // photographer 발화는 호출 전에 핸드오프/추출 모드로 분기됨 — 방어적으로 무시
  }
  if (out.length === 0 || !(out[0] instanceof HumanMessage)) {
    out.unshift(new HumanMessage(ENTER_EVENT));
  }
  // 이번 턴 레퍼런스 이미지들 — haiku vision 묶음 반응 + slots.custom["레퍼런스"] 기록 유도
  if (imageDataUrls.length > 0) {
    const total = Math.max(totalImages, imageDataUrls.length);
    const extra =
      total > imageDataUrls.length
        ? ` (총 ${total}장 중 ${imageDataUrls.length}장만 전달됨 — 나머지는 개수만 언급)`
        : "";
    out.push(
      new HumanMessage({
        content: [
          {
            type: "text",
            text: `(사용자가 레퍼런스 이미지 ${total}장을 첨부했습니다.${extra} 공통 분위기·톤을 묶어 한 문장으로 짚어주고 slots.custom 의 "레퍼런스" 키에 특징을 저장한 뒤, 직전 사용자 발화의 캡션 내용에 답하며 남은 질문을 이어가세요.)`,
          },
          ...imageDataUrls.map((url) => ({ type: "image_url" as const, image_url: { url } })),
        ],
      })
    );
  }
  // 현재 수집 상태를 서버가 직접 계산해 리마인드 — 슬롯 후퇴·수집된 항목 재질문 방지
  // (haiku 는 슬롯 JSON만 주면 "미정" 같은 스킵 값을 미수집으로 오해하고 다시 묻는다)
  const filled = CORE_SLOT_KEYS.filter((k) => typeof slots[k] === "string" && slots[k]!.trim());
  const missing = CORE_SLOT_KEYS.filter((k) => !filled.includes(k));
  const filledDesc = filled.length > 0 ? filled.map((k) => `${k}="${slots[k]}"`).join(", ") : "없음";
  const nextDesc =
    missing.length > 0
      ? `미수집 슬롯(순서대로): ${missing.join(", ")}. 마지막 사용자 발화가 첫 미수집 슬롯의 답이면 그 값을 저장하고 그 다음 미수집 슬롯을 물으세요 (더 없으면 작가 커스텀 질문 또는 done=true 마무리). 수집 완료 슬롯은 값이 "미정"류여도 다시 묻거나 세분화·확인 질문을 하지 마세요.`
      : "코어 슬롯은 전부 수집 완료 — 이미 수집한 항목을 다시 묻지 말고, 남은 작가 커스텀 질문을 진행하거나 다 끝났으면 done=true 로 마무리하세요.";
  out.push(
    new HumanMessage(
      `(시스템: 수집 완료 슬롯: ${filledDesc}. ${nextDesc} 마지막 사용자 발화에서 새로 알아낸 값은 slots 에 병합하세요. 이 괄호 메시지에는 답하지 마세요.)`
    )
  );
  return out;
}

/** LLM 한 턴 — 시스템 프롬프트 구성 → 구조화 출력(1회 재시도) → sanitize */
export async function runBotLlmTurn(params: {
  photographerName: string;
  script: PhotographerScript;
  messages: BotChatMessage[];
  slots: LlmSlots;
  photoContext?: BotPhotoContext | null;
  imageDataUrls?: string[];
  totalImages?: number;
}): Promise<BotTurnClean> {
  const system = buildSystemPrompt({
    photographerName: params.photographerName.trim() || "작가",
    script: params.script,
    photo: params.photoContext ?? null,
  });
  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 512,
    temperature: 0.2, // 접수 봇 — 창의성보다 일관된 슬롯 수집
    ...anthropicClientOptions(),
  });
  const structured = model.withStructuredOutput(botTurnSchema, { name: "bot_turn" });
  const lcMessages = [
    new SystemMessage(system),
    ...toLangChainMessages(
      params.messages,
      params.slots,
      params.imageDataUrls ?? [],
      params.totalImages ?? 0
    ),
  ];
  // 구조화 출력은 확률적으로 파싱에 실패할 수 있다 — 서버에서 1회 재시도.
  let turn;
  try {
    turn = await structured.invoke(lcMessages);
  } catch (first) {
    console.warn("[inquiry-bot] structured output failed once, retrying:", first);
    turn = await structured.invoke(lcMessages);
  }
  const clean = sanitizeBotTurn(turn, params.slots);
  // 질문 수 결정론 — 코어 4 + 등록 커스텀 질문 수를 넘는 보너스 질문은 done 으로 강제
  return enforceQuestionBudget(
    clean,
    params.script.customQuestions.length,
    params.photographerName.trim() || "작가"
  );
}

// DB 메시지 행 → LLM 대화 이력 매핑용 최소 형태
export type DbMessageRow = {
  sender_id: string;
  type: string;
  body: string;
};

/**
 * DB 메시지 → 봇 대화 이력.
 *   · type='bot' + 고객 발신 → user / type='bot' + 작가 발신 → bot
 *   · type='text'|'image' + 작가 발신 → photographer (개입)
 *   · type='text' + 고객 발신 → user (개입 후 일반 발화도 수집 대상)
 *   · system·summary_card 는 제외
 */
export function mapDbMessagesToBotHistory(
  rows: DbMessageRow[],
  customerId: string
): { history: BotChatMessage[]; intervened: boolean } {
  const history: BotChatMessage[] = [];
  let intervened = false;
  for (const m of rows) {
    const mine = m.sender_id === customerId;
    if (m.type === "bot") {
      history.push({ role: mine ? "user" : "bot", text: m.body });
    } else if (m.type === "text" || m.type === "image") {
      const text = m.type === "image" ? "(사진을 보냈어요)" : m.body;
      if (mine) history.push({ role: "user", text });
      else {
        history.push({ role: "photographer", text });
        intervened = true;
      }
    }
  }
  return { history, intervened };
}

/**
 * 방 시드 — 문의 사진(있으면) + 봇 인사 + 첫 질문을 방에 남긴다 (방당 1회, idempotent).
 * 반환: 시드 여부. 봇 발화의 sender 는 작가 profile (렌더는 type='bot' 라벨로 구분).
 */
export async function seedBotRoomMessages(params: {
  conversationId: string;
  customerId: string;
  photographerProfileId: string;
  photographerName: string;
  photo: { thumbUrl: string | null } | null;
  firstQuestion: string;
  /** 작가 KB 가 있으면 수집 인사 대신 상담 인사로 열고 첫 질문은 시드하지 않는다 */
  qaMode?: boolean;
  /** 상담 인사말 (작가별 > 전역 > 코드 기본). 비면 코드 기본 */
  greeting?: string;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", params.conversationId);
  if ((count ?? 0) > 0) return false; // 이미 대화 있음 — 시드 불필요

  const now = Date.now();
  const rows: Record<string, unknown>[] = [];
  if (params.photo?.thumbUrl) {
    rows.push({
      conversation_id: params.conversationId,
      sender_id: params.customerId,
      type: "image",
      body: "이 사진 보고 문의드려요",
      image_path: params.photo.thumbUrl,
      created_at: new Date(now - 40).toISOString(),
    });
  }
  rows.push({
    conversation_id: params.conversationId,
    sender_id: params.photographerProfileId,
    type: "bot",
    body: params.qaMode
      ? (params.greeting ?? "").trim() || kbGreeting(params.photographerName)
      : `안녕하세요! 저는 ${params.photographerName}님의 문의를 대신 받아드리는 자동 응답 봇이에요 🤖\n몇 가지 여쭤보고 정리해서 작가님께 전달드려요. 편하게 입력하셔도 되고, 아래 선택지를 눌러도 좋아요.`,
    created_at: new Date(now - 20).toISOString(),
  });
  if (!params.qaMode) {
    rows.push({
      conversation_id: params.conversationId,
      sender_id: params.photographerProfileId,
      type: "bot",
      body: params.firstQuestion,
      created_at: new Date(now).toISOString(),
    });
  }
  const { error } = await admin.from("messages").insert(rows);
  if (error) {
    console.error("[bot-room] 시드 실패:", error.message);
    return false;
  }
  return true;
}

/**
 * 상담 인사만 뒤늦게 시드한다 — 숨고형 폼(/inquiry)으로 만들어진 방 대응.
 *
 * 그 경로는 방을 만들고 요약 카드만 넣기 때문에 봇 발화가 하나도 없다. 그런데 요구사항상
 * **두 트랙 모두** 작가가 첫 마디를 하기 전까지는 봇이 응대해야 한다. 그래서 방에 봇 발화가
 * 없으면 여기서 인사 한 줄을 깔아, 손님이 "작가 방인데 지금은 봇이 대신 답한다"를 알게 한다.
 * 봇 발화가 이미 있으면(=봇으로 시작한 방) 아무것도 하지 않는다.
 */
export async function seedQaGreetingIfMissing(params: {
  conversationId: string;
  photographerProfileId: string;
  photographerName: string;
  /** 작가별 인사말 > 전역 인사말 > 코드 기본 순으로 이미 정해져 내려온다 */
  greeting?: string;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", params.conversationId)
    .eq("type", "bot");
  if ((count ?? 0) > 0) return false;

  const { error } = await admin.from("messages").insert({
    conversation_id: params.conversationId,
    sender_id: params.photographerProfileId,
    type: "bot",
    body: (params.greeting ?? "").trim() || kbGreeting(params.photographerName),
  });
  if (error) {
    console.error("[bot-room] 상담 인사 시드 실패:", error.message);
    return false;
  }
  return true;
}

// ── 상담(Q&A) 모드 ───────────────────────────────────────────────
// 수집이 아니라 답변이 목적인 턴. 근거는 작가 KB 카드 + 사매 공통 정책뿐이고,
// 생성된 답변은 서버에서 기계 검증(카드 존재·숫자·기한)을 통과해야 게시된다.

const qaTurnSchema = z.object({
  reply: z.string().describe("손님에게 보낼 답변 (1~3문장 존댓말)"),
  citedCardIds: z.array(z.string()).describe("근거로 사용한 카드 id 목록"),
  needsHuman: z.boolean().describe("근거가 없거나 부분적이라 작가가 답해야 하면 true"),
  suggestions: z.array(z.string()).max(3).nullish().describe("이어서 궁금해할 만한 짧은 질문"),
});

export async function runBotQaTurn(params: {
  kb: PhotographerKb;
  messages: BotChatMessage[];
  /** 전역 정책·기본 말투·모델 (어드민에서 관리). 없으면 코드 상수로 동작한다 */
  settings?: { policy: string; defaultTone: string; model: string };
  /** 작가가 스튜디오에서 정한 말투 — 없으면 전역 기본 말투 */
  tone?: string;
}): Promise<QaTurn & { blockedReason?: string }> {
  const policy = params.settings?.policy;
  const tone = (params.tone ?? "").trim() || params.settings?.defaultTone || "";
  const model = new ChatAnthropic({
    model: params.settings?.model || MODEL,
    maxTokens: 700,
    temperature: 0.2, // 상담 답변 — 창의성보다 근거 충실도
    ...anthropicClientOptions(),
  });
  const structured = model.withStructuredOutput(qaTurnSchema, { name: "qa_turn" });
  const lcMessages: BaseMessage[] = [new SystemMessage(buildQaPrompt(params.kb, { policy, tone }))];
  for (const m of params.messages) {
    if (m.role === "user") lcMessages.push(new HumanMessage(m.text));
    else if (m.role === "bot") lcMessages.push(new AIMessage(m.text));
  }
  if (lcMessages.length === 1) lcMessages.push(new HumanMessage(ENTER_EVENT));

  let raw;
  try {
    raw = await structured.invoke(lcMessages);
  } catch (first) {
    console.warn("[bot-kb] structured output failed once, retrying:", first);
    raw = await structured.invoke(lcMessages);
  }

  const turn: QaTurn = {
    reply: (raw.reply ?? "").trim(),
    citedCardIds: raw.citedCardIds ?? [],
    needsHuman: raw.needsHuman ?? false,
    suggestions: (raw.suggestions ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 3),
  };

  const lastUser = [...params.messages].reverse().find((m) => m.role === "user")?.text ?? "";
  const problems = validateGrounding(turn, params.kb.cards, lastUser, policy);
  if (problems.length > 0) {
    // 틀린 답보다 침묵이 낫다 — 검증에 걸리면 작가에게 넘긴다.
    console.warn("[bot-kb] 근거 검증 실패 → 넘김:", problems.join(" / "), "|", turn.reply);
    return { ...degradeToHandoff(turn, params.kb.displayName), blockedReason: problems.join(" / ") };
  }
  return turn;
}

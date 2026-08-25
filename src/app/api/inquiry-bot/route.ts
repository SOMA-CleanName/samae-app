// LLM 문의 챗봇 라우트 — LangChain(ChatAnthropic) + 구조화 출력.
//
// - LLM 호출은 이 서버 라우트에서만 (ANTHROPIC_API_KEY 노출 금지)
// - 안전: 대화 이력에 작가(photographer) 발화가 있으면 LLM 호출 없이 즉시 봇 정지
// - 출력: botTurnSchema(zod) 구조화 출력 → sanitizeBotTurn 으로 슬롯 병합·done 검증
// - 작가 문의대본(photographer-scripts)과 사진 컨텍스트를 시스템 프롬프트에 주입

import { NextResponse } from "next/server";
import { ChatAnthropic } from "@langchain/anthropic";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import {
  CORE_SLOT_KEYS,
  botTurnSchema,
  buildSystemPrompt,
  hasPhotographerIntervened,
  sanitizeBotTurn,
  type BotApiRequest,
  type BotChatMessage,
  type LlmSlots,
} from "@/lib/inquiry-bot-llm";
import { getPhotographerScript } from "@/lib/photographer-scripts";

export const runtime = "nodejs";

// haiku — 문의 접수는 슬롯 채우기 중심의 좁은 태스크라 소형 모델로 충분 (비용·지연 최소화)
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const MAX_HISTORY = 40; // 폭주 방지 — 문의 대화가 이 길이를 넘을 일은 사실상 없음

// 대화 시작 신호 — Anthropic 은 user 턴으로 시작해야 하므로, 봇이 먼저 인사하는
// 우리 플로우에서는 입장 이벤트를 첫 user 턴으로 넣는다.
const ENTER_EVENT = "(사용자가 문의 채팅방에 입장했습니다. 인사하고 첫 질문을 시작하세요.)";

function toLangChainMessages(messages: BotChatMessage[], slots: LlmSlots): BaseMessage[] {
  const out: BaseMessage[] = [];
  for (const m of messages) {
    if (m.role === "user") out.push(new HumanMessage(m.text));
    else if (m.role === "bot") out.push(new AIMessage(m.text));
    // photographer 발화는 여기 오기 전에 핸드오프로 차단됨 — 방어적으로 무시
  }
  if (out.length === 0 || !(out[0] instanceof HumanMessage)) {
    out.unshift(new HumanMessage(ENTER_EVENT));
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

export async function POST(req: Request) {
  let body: BotApiRequest;
  try {
    body = (await req.json()) as BotApiRequest;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const photographerId = typeof body.photographerId === "string" ? body.photographerId : "";
  if (!photographerId) {
    return NextResponse.json({ error: "photographerId required" }, { status: 400 });
  }
  const messages: BotChatMessage[] = Array.isArray(body.messages)
    ? body.messages
        .filter(
          (m): m is BotChatMessage =>
            !!m &&
            typeof m.text === "string" &&
            (m.role === "user" || m.role === "bot" || m.role === "photographer")
        )
        .slice(-MAX_HISTORY)
    : [];
  const slots: LlmSlots = body.slots && typeof body.slots === "object" ? body.slots : {};

  // ── 작가 개입 = 봇 정지. LLM 호출 자체를 하지 않는다 ──
  if (hasPhotographerIntervened(messages)) {
    return NextResponse.json({ handedOff: true });
  }

  const script = getPhotographerScript(photographerId);
  const system = buildSystemPrompt({
    photographerName: body.photographerName?.trim() || "작가",
    script,
    photo: body.photoContext ?? null,
  });

  try {
    const model = new ChatAnthropic({
      model: MODEL,
      maxTokens: 512,
      temperature: 0.2, // 접수 봇 — 창의성보다 일관된 슬롯 수집
    });
    const structured = model.withStructuredOutput(botTurnSchema, { name: "bot_turn" });
    const lcMessages = [new SystemMessage(system), ...toLangChainMessages(messages, slots)];
    // 구조화 출력은 확률적으로 파싱에 실패할 수 있다 — 서버에서 1회 재시도 후에만 502.
    // (한 번의 일시 실패가 클라이언트를 버튼 폴백으로 강등시켰던 실사고 재발 방지)
    let turn;
    try {
      turn = await structured.invoke(lcMessages);
    } catch (first) {
      console.warn("[inquiry-bot] structured output failed once, retrying:", first);
      turn = await structured.invoke(lcMessages);
    }
    return NextResponse.json({ ...sanitizeBotTurn(turn, slots), handedOff: false });
  } catch (e) {
    // 클라이언트는 이 실패(재시도 포함 2회 연속)를 받으면 기존 버튼 상태 머신으로 폴백한다
    console.error("[inquiry-bot] LLM call failed:", e);
    return NextResponse.json({ error: "llm_unavailable" }, { status: 502 });
  }
}

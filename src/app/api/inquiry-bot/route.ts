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
  shouldNotifyStarted,
  validateMessageLimits,
  type BotApiRequest,
  type BotChatMessage,
  type LlmSlots,
} from "@/lib/inquiry-bot-llm";
import { getCurrentUser } from "@/lib/auth";
import { getPhotographerScript } from "@/lib/photographer-scripts";
import { notifyPhotographer } from "@/lib/inquiry-bot-notify";

export const runtime = "nodejs";

// haiku — 문의 접수는 슬롯 채우기 중심의 좁은 태스크라 소형 모델로 충분 (비용·지연 최소화)
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

// 대화 시작 신호 — Anthropic 은 user 턴으로 시작해야 하므로, 봇이 먼저 인사하는
// 우리 플로우에서는 입장 이벤트를 첫 user 턴으로 넣는다.
const ENTER_EVENT = "(사용자가 문의 채팅방에 입장했습니다. 인사하고 첫 질문을 시작하세요.)";

// 레퍼런스 이미지 data URL 상한 — 클라이언트가 800px 로 축소해 보내므로 넉넉한 방어선
const MAX_IMAGE_DATAURL_CHARS = 2_500_000; // ≈ 1.8MB 원본
const MAX_VISION_IMAGES = 3; // vision 에 넘기는 최대 장수 — 초과분은 개수만 언급

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
    // photographer 발화는 여기 오기 전에 핸드오프로 차단됨 — 방어적으로 무시
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

export async function POST(req: Request) {
  let body: BotApiRequest;
  try {
    body = (await req.json()) as BotApiRequest;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // 프로덕션 인증 필수 — 익명 LLM 호출(비용·남용) 차단. dev 는 통과 (드라이런·데모 편의).
  if (process.env.NODE_ENV === "production") {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const photographerId = typeof body.photographerId === "string" ? body.photographerId : "";
  if (!photographerId) {
    return NextResponse.json({ error: "photographerId required" }, { status: 400 });
  }
  const messages: BotChatMessage[] = Array.isArray(body.messages)
    ? body.messages.filter(
        (m): m is BotChatMessage =>
          !!m &&
          typeof m.text === "string" &&
          (m.role === "user" || m.role === "bot" || m.role === "photographer")
      )
    : [];
  // 환경 무관 상한 — 턴 수·발화 길이 초과는 자르지 않고 400 거부 (프롬프트 스터핑·폭주 차단)
  const limits = validateMessageLimits(messages);
  if (!limits.ok) {
    return NextResponse.json({ error: limits.reason }, { status: 400 });
  }
  const slots: LlmSlots = body.slots && typeof body.slots === "object" ? body.slots : {};
  // 레퍼런스 이미지들 — data URL 형식·크기 검증 후 최대 3장 (아니면 조용히 무시, 흐름 무영향)
  const imageDataUrls = (Array.isArray(body.images) ? body.images : [])
    .map((i) => i?.dataUrl)
    .filter(
      (u): u is string =>
        typeof u === "string" && u.startsWith("data:image/") && u.length <= MAX_IMAGE_DATAURL_CHARS
    )
    .slice(0, MAX_VISION_IMAGES);
  const totalImages =
    typeof body.totalImages === "number" && body.totalImages > 0
      ? Math.floor(body.totalImages)
      : imageDataUrls.length;

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
    const lcMessages = [
      new SystemMessage(system),
      ...toLangChainMessages(messages, slots, imageDataUrls, totalImages),
    ];
    // 구조화 출력은 확률적으로 파싱에 실패할 수 있다 — 서버에서 1회 재시도 후에만 502.
    // (한 번의 일시 실패가 클라이언트를 버튼 폴백으로 강등시켰던 실사고 재발 방지)
    let turn;
    try {
      turn = await structured.invoke(lcMessages);
    } catch (first) {
      console.warn("[inquiry-bot] structured output failed once, retrying:", first);
      turn = await structured.invoke(lcMessages);
    }
    const clean = sanitizeBotTurn(turn, slots);

    // 작가 알림 — "새 손님이 챗봇 문의 진행 중/완료" 를 알려 채팅 이어받기를 유도 (리드 구조 폐지).
    // started 는 크롤러·재방문마다 재발화되던 "빈 messages 첫 턴"이 아니라 사용자의 첫 실제
    // 발화 시점에만 + 클라이언트 localStorage dedupe(startedNotified). TODO(C3): conversation dedupe.
    const notifyStarted = shouldNotifyStarted(messages, body.startedNotified === true);
    if (clean.done || notifyStarted) {
      const s = clean.slots;
      await notifyPhotographer({
        event: clean.done ? "bot_inquiry_completed" : "bot_inquiry_started",
        photographerId,
        photographerName: body.photographerName,
        photoId: body.photoId,
        summary: clean.done
          ? [
              s.purpose && `목적=${s.purpose}`,
              s.preferredDate && `희망일=${s.preferredDate}`,
              s.region && `지역=${s.region}`,
              s.partySize && `인원=${s.partySize}`,
              s.custom && Object.keys(s.custom).length > 0 && `커스텀 ${Object.keys(s.custom).length}건`,
            ]
              .filter(Boolean)
              .join(", ")
          : undefined,
      });
    }
    return NextResponse.json({ ...clean, handedOff: false });
  } catch (e) {
    // 클라이언트는 이 실패(재시도 포함 2회 연속)를 받으면 기존 버튼 상태 머신으로 폴백한다
    console.error("[inquiry-bot] LLM call failed:", e);
    return NextResponse.json({ error: "llm_unavailable" }, { status: 502 });
  }
}

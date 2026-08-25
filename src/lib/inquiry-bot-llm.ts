// LLM 문의 챗봇 — 순수 공유 로직 (React·LangChain 의존 없음).
//
// /api/inquiry-bot 라우트와 UI(InquiryBotChat)가 공유하는:
// - 대화 메시지·슬롯 타입과 API 계약(zod 스키마)
// - 작가 개입(핸드오프) 감지 — photographer 메시지가 있으면 봇은 즉시 정지
// - 시스템 프롬프트 빌더 — 필수 슬롯 규칙 + 작가 문의대본 + 사진 컨텍스트 주입
// - LLM 출력 후처리(sanitize) — done 은 코어 슬롯이 전부 찼을 때만 허용
//
// 기존 inquiry-bot.ts(버튼 상태 머신)의 질문·선택지·스킵 규칙을 재사용해
// LLM 모드와 폴백(버튼) 모드가 같은 데이터 위에서 동작한다.

import { z } from "zod";
import { CORE_STEPS, type BotAnswers } from "./inquiry-bot.ts";
import type { PhotographerScript } from "./photographer-scripts.ts";

// ── 대화 메시지 ──────────────────────────────────────────────────
export type BotChatRole = "user" | "bot" | "photographer";
export type BotChatMessage = { role: BotChatRole; text: string };

/** 작가 개입 감지 — 이력에 photographer 발화가 하나라도 있으면 봇 정지 */
export function hasPhotographerIntervened(messages: BotChatMessage[]): boolean {
  return messages.some((m) => m.role === "photographer");
}

// ── 슬롯 ─────────────────────────────────────────────────────────
export const CORE_SLOT_KEYS = ["purpose", "preferredDate", "region", "partySize"] as const;

export type LlmSlots = {
  purpose?: string;
  preferredDate?: string;
  region?: string;
  partySize?: string;
  /** 작가 커스텀 대본 질문 답변 — 질문 요지 → 답변 */
  custom?: Record<string, string>;
};

/** 코어 4슬롯이 모두 수집됐는지 (스킵 라벨도 값으로 인정 — 상태 머신과 동일 규칙) */
export function coreSlotsFilled(slots: LlmSlots): boolean {
  return CORE_SLOT_KEYS.every((k) => {
    const v = slots[k];
    return typeof v === "string" && v.trim().length > 0;
  });
}

/** LLM 슬롯 → 상태 머신 BotAnswers (요약 카드·submitInquiry 변환 재사용) */
export function slotsToAnswers(slots: LlmSlots): BotAnswers {
  const answers: BotAnswers = {};
  for (const k of CORE_SLOT_KEYS) {
    const v = slots[k];
    if (typeof v === "string" && v.trim()) answers[k] = v.trim();
  }
  return answers;
}

/** 저장된 BotAnswers → LLM 슬롯 (localStorage 복원 시 이어서 진행) */
export function answersToSlots(answers: BotAnswers): LlmSlots {
  const slots: LlmSlots = {};
  for (const k of CORE_SLOT_KEYS) {
    const v = answers[k];
    if (typeof v === "string" && v.trim()) slots[k] = v;
  }
  return slots;
}

// ── API 계약 (zod) ───────────────────────────────────────────────
// ⚠️ 미수집 필드는 반드시 null 도 허용할 것 (nullish).
// haiku 가 미수집 슬롯을 필드 생략(undefined)이 아니라 `"region": null` 로 내보내는 경우가
// 실제로 있었고, optional()만 쓰면 OUTPUT_PARSING_FAILURE → 502 → 버튼 폴백 강등으로 이어졌다.
// null 정규화는 sanitizeBotTurn 이 담당한다.
export const llmSlotsSchema = z.object({
  purpose: z.string().nullish().describe("촬영 목적 (예: 커플·우정 스냅, 웨딩). 미수집이면 null"),
  preferredDate: z
    .string()
    .nullish()
    .describe("촬영 희망일 — 구체적 날짜면 yyyy-mm-dd, 아니면 사용자가 말한 표현 그대로. 미수집이면 null"),
  region: z.string().nullish().describe("촬영 지역 (예: 서울, 경기·인천). 미수집이면 null"),
  partySize: z.string().nullish().describe("촬영 인원 (예: 2명, 3~6명). 미수집이면 null"),
  custom: z
    .record(z.string().nullable())
    .nullish()
    .describe("작가 커스텀 질문 답변 — 질문 요지를 키로, 답변을 값으로"),
});

// 봇이 지금 어떤 주제를 묻는 중인지 — 계측(Q* Viewed)과 진행 표시용
export const askingSchema = z.enum(["purpose", "preferredDate", "region", "partySize", "custom", "none"]);
export type AskingKey = z.infer<typeof askingSchema>;

export const botTurnSchema = z.object({
  reply: z.string().describe("사용자에게 보낼 봇 답변 (짧은 존댓말, 한 번에 한 질문)"),
  slots: llmSlotsSchema.describe("지금까지 수집한 슬롯 전체 (기존 값 유지 + 새로 알아낸 값 병합)"),
  quickReplies: z
    .array(z.string())
    .max(8)
    .nullish()
    .describe("사용자가 탭해서 답할 수 있는 짧은 선택지 (질문과 무관하면 빈 배열)"),
  asking: askingSchema.nullish().describe("이번 답변에서 묻고 있는 주제 (질문이 아니면 none)"),
  done: z.boolean().nullish().describe("필수 슬롯 수집과 커스텀 질문이 끝나 요약 단계로 넘어가도 되는지"),
});
export type BotTurn = z.infer<typeof botTurnSchema>;

// null/생략이 정규화된 클린 턴 — 클라이언트가 받는 실제 응답 형태
export type BotTurnClean = {
  reply: string;
  slots: LlmSlots;
  quickReplies: string[];
  asking: AskingKey;
  done: boolean;
};

/** API 응답 — 핸드오프면 봇 정지 신호만 보낸다 */
export type BotApiResponse = (BotTurnClean & { handedOff?: false }) | { handedOff: true };

export type BotApiRequest = {
  photographerId: string;
  photoId?: string;
  photographerName?: string;
  messages: BotChatMessage[];
  slots: LlmSlots;
  photoContext?: { moodTags?: string[]; priceKrw?: number | null };
  /**
   * 이번 턴에 사용자가 첨부한 레퍼런스 이미지 (클라이언트에서 축소한 data URL).
   * haiku vision 이 한 줄 반응 + slots.custom["레퍼런스"] 기록에 사용. 이력에는 텍스트 플레이스홀더만 남긴다.
   */
  image?: { dataUrl: string };
};

// ── LLM 출력 후처리 ──────────────────────────────────────────────
// LLM 이 슬롯을 빠뜨리고 done=true 를 내는 것을 서버에서 차단하고,
// 이전 슬롯 값을 병합해 수집 상태가 후퇴하지 않게 하며, null/생략을 전부 정규화한다.
export function sanitizeBotTurn(turn: BotTurn, prevSlots: LlmSlots): BotTurnClean {
  // custom 병합 — 모델이 값을 null 로 내보낸 항목은 버린다
  const mergedCustom: Record<string, string> = { ...prevSlots.custom };
  for (const [k, v] of Object.entries(turn.slots.custom ?? {})) {
    if (typeof v === "string" && v.trim()) mergedCustom[k] = v.trim();
  }
  const slots: LlmSlots = {
    ...prevSlots,
    ...Object.fromEntries(
      CORE_SLOT_KEYS.flatMap((k) => {
        const v = turn.slots[k];
        return typeof v === "string" && v.trim() ? [[k, v.trim()]] : [];
      })
    ),
    ...(Object.keys(mergedCustom).length > 0 ? { custom: mergedCustom } : {}),
  };
  return {
    reply: turn.reply.trim(),
    slots,
    quickReplies: (turn.quickReplies ?? []).map((q) => q.trim()).filter(Boolean).slice(0, 8),
    asking: turn.asking ?? "none",
    // done 은 코어 4슬롯이 실제로 전부 찼을 때만 — 미수집 상태의 조기 종료 방지
    done: (turn.done ?? false) && coreSlotsFilled(slots),
  };
}

// ── 시스템 프롬프트 ──────────────────────────────────────────────
export type PromptContext = {
  photographerName: string;
  script: PhotographerScript;
  photo?: { moodTags?: string[]; priceKrw?: number | null } | null;
};

const KRW = new Intl.NumberFormat("ko-KR");

export function buildSystemPrompt({ photographerName, script, photo }: PromptContext): string {
  // 코어 슬롯 규칙 — 상태 머신(CORE_STEPS)의 선택지·소프트스킵을 그대로 명세
  const slotRules = CORE_STEPS.map((s) => {
    const q = s.question.map((seg) => seg.text).join("");
    const opts = s.options ? ` 대표 선택지: ${s.options.join(" / ")}.` : "";
    return `- ${s.key} (${s.short}): "${q}"${opts} 모르겠다고 하면 "${s.skip}" 값으로 저장하고 넘어간다.`;
  }).join("\n");

  const customBlock =
    script.customQuestions.length > 0
      ? `\n[작가 커스텀 질문 — 코어 슬롯 수집 후 반드시 순서대로 유도할 것]\n${script.customQuestions
          .map((q, i) => `${i + 1}. ${q}`)
          .join("\n")}\n답변은 slots.custom 에 질문 요지를 키로 저장한다. 사용자가 건너뛰길 원하면 강요하지 않는다.`
      : "";

  const photoLines: string[] = [];
  if (photo?.moodTags && photo.moodTags.length > 0) photoLines.push(`무드 태그: ${photo.moodTags.join(", ")}`);
  if (photo?.priceKrw != null) photoLines.push(`참고 가격: ${KRW.format(photo.priceKrw)}원~`);
  const photoBlock =
    photoLines.length > 0
      ? `\n[문의 사진 컨텍스트 — 자연스럽게 참고하되 가격 협상은 하지 않는다]\n${photoLines.join("\n")}`
      : "";

  return `너는 사진 촬영 마켓플레이스 '사매(samae)'의 문의 접수 도우미다. 사용자가 작가 "${photographerName}"님에게 보낼 문의를 대화로 정리한다.

[말투]
${script.tone}
- 답변은 1~3문장으로 짧게. 한 번에 반드시 한 가지만 묻는다.
- 사용자가 이미 말한 내용을 다시 묻지 않는다.

[필수 슬롯 — 아래 순서를 기본으로 하되 사용자가 먼저 말한 정보는 즉시 저장]
${slotRules}
- 날짜는 구체적이면 yyyy-mm-dd 로, "다음 달쯤" 같은 표현은 그대로 저장한다.
${customBlock}${photoBlock}

[진행 규칙]
- 매 턴 slots 에 지금까지 수집한 값 전체를 담는다 (기존 값 유지).
- 슬롯에 이미 값이 있으면 — "미정", "협의 후 결정", "그 외 목적" 같은 스킵 표현도 유효한 답변이다 — 그 슬롯은 절대 다시 묻지 않고 다음 미수집 항목으로 넘어간다.
- 현재 묻는 주제를 asking 에 넣는다 (인사·마무리 등 질문이 아니면 none).
- quickReplies 에는 현재 질문에 탭으로 답할 수 있는 짧은 선택지를 넣는다 (자유 서술형 질문이면 빈 배열 또는 "잘 모르겠어요" 정도만).
- 첫 인사에는 "편하게 입력하셔도 되고, 아래 선택지를 눌러도 좋아요" 뉘앙스를 한 줄 넣어 자유 입력이 기본임을 알린다.
- 필수 슬롯과 커스텀 질문이 모두 끝나면 done=true 로 하고, "정리해서 ${photographerName}님께 전달드릴게요" 톤으로 마무리한다.
- 사용자가 레퍼런스 이미지를 보내면: 분위기·톤·구도를 한 문장으로 따뜻하게 짚어주고(예: "따뜻한 필름 톤 레퍼런스네요! 참고해서 작가님께 전달드릴게요"), 그 특징 요약을 slots.custom 의 "레퍼런스" 키에 저장한 뒤, 남은 수집 질문을 이어간다.
- 사용자가 수집과 무관한 것을 물어도(예: "가격이 얼마예요?", "예약은 어떻게 해요?") 무시하지 말고 한두 문장으로 자연스럽게 응대한 뒤, 같은 턴에서 곧바로 수집 질문으로 복귀한다. 단 가격·환불 등 정책성 내용은 단정하지 말고 "작가님이 직접 안내드릴 거예요" 톤으로 넘긴다. 작가 사생활 등 부적절한 주제는 정중히 문의 흐름으로 돌린다.`;
}

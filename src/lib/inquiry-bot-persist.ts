// 챗봇 대화 영속화 어댑터 — "리드 생성" 구조에서 "채팅 상주" 구조로 갈아끼우는 자리.
//
// 새 목표 플로우에서 문의 완료의 의미:
//   (구) 리드 생성 → 운영진이 연락처 공개 중개
//   (신) 채팅방에 문의 요약이 남고, 작가가 여유 있을 때 들어와 봇을 이어받는다
//
// 마이그레이션(messages enum 확장·봇 프로필·conversation_bot_states — docs/드래프트-챗봇-스키마.sql)
// 적용 전이라, 현재 구현은 **legacy 호환 모드**: 기존 submitInquiry 서버 액션이 받는 FormData 를
// 빌드해 UI(useActionState)가 그대로 호출한다. 드라이런 가드는 UI(InquiryBotChat)에 있다.
//
// C3 본구현으로 교체 시(persistBotConversation 시그니처 유지):
//   1. conversations 방 생성/재사용 (user↔photographer 1:1 unique)
//   2. messages 에 대화 이력 저장 (type: bot/text/image/summary_card, 봇 프로필 sender)
//   3. conversation_bot_states 갱신 (status='done', answers=slots)
//   4. profiles.phone 저장 (컬럼 존재 확인됨 — SMS 재소환용 연락처)
//   5. notifyPhotographer('bot_inquiry_completed') — 이미 라우트에 배선됨
// 순수 모듈(React·server 의존 없음) — 테스트는 inquiry-bot-persist.test.ts

import { toInquiryFields, type BotStep, type ContactType } from "./inquiry-bot.ts";
import { slotsToAnswers, type BotChatMessage, type LlmSlots } from "./inquiry-bot-llm.ts";

export type BotConversationRecord = {
  photographerId: string;
  photoId: string;
  slots: LlmSlots;
  /** 전체 대화 이력 — legacy 모드에선 저장되지 않음 (C3에서 messages 로 승격) */
  transcript: BotChatMessage[];
  contact: { type: ContactType; value: string };
  /** 업로드된 레퍼런스 이미지 public URL (드라이런은 빈 배열 — 미리보기만) */
  referenceImageUrls: string[];
  /** 드라이런 포함 실제 첨부 시도 수 — URL 이 없어도 노트에 남긴다 */
  referenceImageCount: number;
  /** utm_* / landing_path — UI 가 sessionStorage 에서 읽어 전달 */
  attribution?: Record<string, string>;
};

/** C3 본구현이 따를 시그니처 — legacy 모드에선 UI 가 FormData 빌더를 대신 사용 */
export type PersistBotConversation = (
  record: BotConversationRecord
) => Promise<{ ok: boolean; conversationId?: string; error?: string }>;

const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

// 커스텀 답변·레퍼런스를 legacy inquiries.note 로 직조 — 작가가 어드민/채팅에서 그대로 본다
export function buildBotNote(record: BotConversationRecord): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(record.slots.custom ?? {})) {
    lines.push(`${k}: ${v}`);
  }
  if (record.referenceImageCount > 0) {
    lines.push(
      record.referenceImageUrls.length > 0
        ? `레퍼런스 이미지 ${record.referenceImageUrls.length}장: ${record.referenceImageUrls.join(" ")}`
        : `레퍼런스 이미지 ${record.referenceImageCount}장 첨부 (개발 모드 — 미업로드)`
    );
  }
  if (lines.length > 0) lines.unshift("[챗봇 수집]");
  return lines.join("\n");
}

// legacy 호환 — 기존 submitInquiry 서버 액션의 FormData 계약 그대로.
// (위저드 submit 과 동일 규칙: partySize 스킵=미입력, 날짜 ISO→한국어 표기는 toInquiryFields 가 처리)
export function buildLegacyInquiryFormData(
  steps: BotStep[],
  record: BotConversationRecord
): FormData {
  const fd = new FormData();
  fd.set("photographerId", record.photographerId);
  fd.set("photoId", record.photoId);

  const fields = toInquiryFields(steps, slotsToAnswers(record.slots));
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);

  const note = buildBotNote(record);
  if (note) fd.set("note", note);

  if (record.contact.type === "phone") {
    const d = record.contact.value.replace(/\D/g, "");
    fd.set("phone", `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`);
  } else {
    fd.set("kakaoId", record.contact.value.trim());
  }

  for (const k of ATTRIBUTION_KEYS) {
    const v = record.attribution?.[k];
    if (v) fd.set(k, v.slice(0, 200));
  }
  const lp = record.attribution?.landing_path;
  if (lp) fd.set("landing_path", lp.slice(0, 300));

  // C3 — 대화 이력을 서버로 전달 (submitInquiry 가 conversations/messages 로 승격)
  if (record.transcript.length > 0) {
    fd.set("botTranscript", JSON.stringify(record.transcript).slice(0, 100_000));
  }

  return fd;
}

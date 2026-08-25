import "server-only";

import { SITE_URL } from "@/lib/site";

// 작가 알림 어댑터 — 리드 구조 폐지 후의 재소환 동선.
//
// 새 플로우: 챗봇이 문의를 수집하는 동안/완료 시 작가에게 "새 손님" 알림이 가 있고,
// 작가는 여유 있을 때 채팅방에 들어와 봇을 이어받는다. 사용자는 작가 메시지가 오면
// 가입 시 받은 연락처로 SMS(서비스 링크 포함) 재소환.
//
// 현재 실구현:
// - notifyPhotographer: 기존 디스코드 웹훅(DISCORD_INQUIRY_WEBHOOK_URL, ops-alert.ts 패턴 재사용).
//   dev 에서는 콘솔 로그만 (웹훅 미발송 — 채널 오염 방지).
// - notifyUserBySms: 스텁 — 솔라피 계정 준비되면 연결 (TODO C3).
// C3 본구현에서 conversation 단위 dedupe(같은 방 started 1회)와 알림 큐 테이블로 승격
// (docs/드래프트-챗봇-스키마.sql 참고).

export type BotNotifyEvent =
  | "bot_inquiry_started" // 챗봇 문의 진행 시작 (첫 턴)
  | "bot_inquiry_completed" // 필수 슬롯 수집 완료 (요약 단계 진입)
  | "bot_inquiry_handed_off"; // 작가가 대화를 이어받음 (C3 — 현재 미발화)

const EVENT_LABEL: Record<BotNotifyEvent, string> = {
  bot_inquiry_started: "🤖 새 손님이 챗봇 문의를 진행 중이에요",
  bot_inquiry_completed: "✅ 챗봇 문의 수집이 완료됐어요 — 채팅방에서 이어받아 주세요",
  bot_inquiry_handed_off: "🤝 작가님이 대화를 이어받았어요",
};

// ops-alert.ts 와 동일한 채널 폴백 규칙
const WEBHOOK =
  process.env.DISCORD_INQUIRY_WEBHOOK_URL || process.env.DISCORD_OPS_WEBHOOK_URL;

export type NotifyPhotographerParams = {
  event: BotNotifyEvent;
  photographerId: string;
  photographerName?: string;
  photoId?: string;
  /** 수집 슬롯 요약 — PII(연락처) 절대 포함 금지 */
  summary?: string;
};

export async function notifyPhotographer(params: NotifyPhotographerParams): Promise<void> {
  const label = EVENT_LABEL[params.event];
  const lines = [
    `${label}`,
    `작가: ${params.photographerName ?? params.photographerId}`,
    params.summary ? `수집 내용: ${params.summary}` : null,
    SITE_URL ? `스튜디오: ${SITE_URL}/studio` : null,
  ].filter(Boolean);

  // dev — 웹훅 대신 콘솔 로그만 (실채널 오염 방지)
  if (process.env.NODE_ENV !== "production") {
    console.log(`[inquiry-bot notify:${params.event}]`, lines.join(" | "));
    return;
  }
  if (!WEBHOOK) return; // 미설정 — 조용히 패스 (ops-alert 관례)

  try {
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: lines.join("\n") }),
    });
  } catch (e) {
    // 알림 실패가 문의 흐름을 막으면 안 된다
    console.error("[inquiry-bot] photographer notify failed:", e);
  }
}

// ── 사용자 SMS 재소환 (스텁) ─────────────────────────────────────
// TODO(C3): 솔라피 계정 연결 — 작가 첫 응답 시 "작가님이 답을 남겼어요 {SITE_URL}/chat/{id}" 발송.
// 연락처 출처: profiles.phone (컬럼 존재 확인됨 — 챗봇 연락처 스텝에서 저장 예정).
export type SmsResult = { sent: boolean; reason?: string };

export async function notifyUserBySms(params: {
  phone: string;
  message: string;
}): Promise<SmsResult> {
  void params; // 솔라피 연결 시 사용
  return { sent: false, reason: "sms_provider_not_configured" };
}

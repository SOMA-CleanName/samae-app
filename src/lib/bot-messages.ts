// 봇 고정 메시지의 기본값·치환 규칙 — 서버(문구 생성)와 어드민 편집기(클라이언트)가
// 같은 기본값을 봐야 해서 server-only 가 붙지 않은 별도 파일에 둔다.
//
// 실제 저장된 문구는 bot_settings 에 있고(운영이 어드민에서 수정), 비어 있으면 여기 기본값이 쓰인다.

import { BOT_DISPLAY_NAME, BOT_HANDOFF_NOTICE } from "./bot-identity";
import { kbGreeting } from "./bot-kb";

/** 고정 메시지 안의 작가 이름 토큰 */
export const PHOTOGRAPHER_TOKEN = "{작가}";

/** 코드 기본 문구 — DB 가 비어 있을 때 그대로 쓰이고, 어드민 placeholder 로도 보여준다 */
export const DEFAULT_MESSAGES = {
  botName: BOT_DISPLAY_NAME,
  greeting: kbGreeting(PHOTOGRAPHER_TOKEN),
  handoff: BOT_HANDOFF_NOTICE,
  noAnswer: `작가님께 그대로 전달드릴게요. ${PHOTOGRAPHER_TOKEN}님이 확인하시면 직접 답해주실 거예요.`,
  error: "잠시 연결이 원활하지 않아요. 남겨주신 내용은 그대로 전달되니, 이어서 편하게 적어주세요.",
} as const;

/** {작가} 토큰 치환 */
export function renderBotMessage(template: string, photographerName: string): string {
  return (template ?? "").trim().split(PHOTOGRAPHER_TOKEN).join(photographerName);
}

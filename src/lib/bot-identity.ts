// 봇의 정체성 — 서버(메시지 생성)와 클라이언트(말풍선 렌더)가 같은 문자열을 봐야 해서
// server-only 가 붙지 않은 별도 파일에 둔다.
//
// 사용자 인식 규칙: 이 방은 **작가의 채팅방**이고, 봇은 작가가 자리를 비운 동안
// 대신 안내하는 존재다. 그래서 이름·아바타가 작가와 명확히 달라야 한다.

export const BOT_DISPLAY_NAME = "사매 안내봇";

/**
 * 작가가 대화에 들어온 순간 봇이 스스로 물러나며 남기는 한 줄.
 *
 * 두 문장을 줄로 나눈다 — 앞은 '무슨 일이 일어났는지', 뒤는 '그래서 어떻게 되는지' 라
 * 한 줄로 붙이면 폭이 좁은 말풍선에서 아무 데서나 접힌다.
 */
export const BOT_HANDOFF_NOTICE =
  "작가님이 대화에 들어왔어요.\n지금부터는 작가님이 직접 답해드립니다.";

/**
 * 문구를 바꾸기 전에 쌓인 방도 인계 안내로 인식돼야 한다.
 * 이 배열에 옛 문구를 남겨두지 않으면 과거 방의 안내가 평범한 봇 말풍선으로 그려진다.
 */
const LEGACY_HANDOFF_NOTICES = [
  "작가님이 대화에 들어왔어요. 지금부터는 작가님이 직접 답해드립니다.",
];

/**
 * 이 말풍선이 인계 안내인가 — 렌더 분기용.
 * 운영이 어드민에서 고친 문구(configured)까지 함께 본다.
 */
export function isHandoffNotice(body: string, configured?: string | null): boolean {
  const t = (body ?? "").trim();
  if (!t) return false;
  if (t === BOT_HANDOFF_NOTICE) return true;
  if (LEGACY_HANDOFF_NOTICES.includes(t)) return true;
  return !!configured && t === configured.trim();
}

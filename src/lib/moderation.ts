// 오프플랫폼 유도 감지 — 채팅에서 개인 SNS·연락처로 대화를 빼돌리는 텍스트를 잡는다.
// 순수 함수 (클라이언트·서버 공용). 매칭된 규칙 라벨 목록을 돌려준다 — 비면 통과.
//
// 설계 원칙: 확실한 신호만 차단한다. "인스타에 올리신 사진"처럼 언급만으로는 안 걸리고,
// 채널 이동을 유도하는 조합(플랫폼 + 연락 유도어)일 때만 걸린다. 오탐이 이탈보다 비싸다.

const PHONE_RE = /01[016789][ \-.]?\d{3,4}[ \-.]?\d{4}/;
const URL_RES: [RegExp, string][] = [
  [/open\.kakao\.com/i, "오픈채팅 링크"],
  [/instagram\.com|instagr\.am/i, "인스타 링크"],
  [/t\.me\/|telegram/i, "텔레그램"],
];
// 플랫폼 언급 + 연락 유도어가 함께 있을 때만
const PLATFORM_RE = /(카톡|카카오톡|까똑|인스타|인스타그램|insta|디엠|\bdm\b)/i;
const LURE_RE = /(아이디|계정|친추|친구\s*추가|팔로우|검색|연락|추가|주세요|남겨|보내|알려|드릴게|주시면|받을게)/i;
// 인스타 핸들 패턴 (@handle) — 플랫폼 문맥과 무관하게 유도로 간주
const HANDLE_RE = /@[a-z0-9._]{3,30}/i;

export function detectOffPlatform(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  const matched: string[] = [];
  if (PHONE_RE.test(t)) matched.push("전화번호");
  for (const [re, label] of URL_RES) if (re.test(t)) matched.push(label);
  if (PLATFORM_RE.test(t) && LURE_RE.test(t)) matched.push("SNS·메신저 유도");
  if (HANDLE_RE.test(t) && PLATFORM_RE.test(t)) matched.push("SNS 계정 공유");
  return [...new Set(matched)];
}

/** 차단 시 사용자에게 보여줄 안내문 */
export const MODERATION_NOTICE =
  "개인 연락처·SNS 안내는 보낼 수 없어요. 사매 채팅에서 대화를 이어가 주세요.";

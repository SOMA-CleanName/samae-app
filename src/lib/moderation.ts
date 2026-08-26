// 오프플랫폼 유도 감지 — 채팅에서 개인 SNS·연락처로 대화를 빼돌리는 텍스트를 잡는다.
// 순수 함수 (클라이언트·서버 공용). 매칭된 규칙 라벨 목록을 돌려준다 — 비면 통과.
//
// 우회 대응 (실측된 시도 기반):
//   "공일공77155195"      → 한글 숫자 정규화 후 전화번호 매칭
//   "카톡jh011010"        → 플랫폼 단어에 붙은 ID
//   "@kimjazz99로 연락주세요" → 핸들 + 연락 유도어 (플랫폼 단어 없어도)
//   "kimjazz99 잉스타연락"  → 플랫폼 오탈자 변형(잉스타 등) + 유도어
// 원칙: 가격("150,000원")·일정("오후 3시")·단순 언급("인스타에 올리신 사진")은 통과.

// 한글 숫자 → 디지트 (전화번호 위장 해제)
const KO_DIGITS: Record<string, string> = {
  공: "0", 영: "0", 빵: "0", 일: "1", 이: "2", 삼: "3", 사: "4",
  오: "5", 육: "6", 륙: "6", 칠: "7", 팔: "8", 구: "9",
};

function normalize(text: string): string {
  let t = text.toLowerCase();
  // 한글 숫자 치환 — "일정", "삼각대" 같은 일반 단어 오탐을 줄이기 위해
  // 숫자·한글숫자가 3자 이상 연속되는 구간만 치환한다
  t = t.replace(/[공영빵일이삼사오육륙칠팔구\d][\s\-.,]*(?:[공영빵일이삼사오육륙칠팔구\d][\s\-.,]*){2,}/g, (run) =>
    run.replace(/[\s\-.,]/g, "").replace(/[공영빵일이삼사오육륙칠팔구]/g, (c) => KO_DIGITS[c] ?? c)
  );
  return t;
}

// 플랫폼 언급 (오탈자·변형 포함)
const PLATFORM_RE =
  /(카톡|카카오톡|카카오|까톡|께톡|ㅋㅌ|kakao|인스타|잉스타|인쓰타|인스따|스타그램|insta|\big\b|디엠|\bdm\b|텔레그램|텔레|telegram|라인|line)/i;
// 연락 유도어
const LURE_RE =
  /(아이디|계정|친추|친구\s*추가|팔로우|팔로|검색|연락|추가|주세요|주삼|주세염|남겨|보내|알려|드릴게|주시면|받을게|찾아|하세요|해주|해요|주면|ㄱㄱ)/i;
// 핸들·아이디 패턴
const AT_HANDLE_RE = /@[a-z0-9._\-]{3,30}/i;
// 플랫폼 단어에 바로 붙은 ID: "카톡jh011010", "인스타 kimjazz99", "카톡: abc123"
const PLATFORM_ID_RE =
  /(카톡|카카오톡|카카오|까톡|ㅋㅌ|kakao|인스타|잉스타|인쓰타|insta|디엠|dm|텔레그램|텔레|telegram|라인)\s*[:은는]?\s*@?[a-z0-9._\-]{4,30}/i;

const URL_RES: [RegExp, string][] = [
  [/open\.kakao\.com|kakao\.com\/o\//i, "오픈채팅 링크"],
  [/instagram\.com|instagr\.am/i, "인스타 링크"],
  [/t\.me\/|telegram\.me/i, "텔레그램 링크"],
  [/linktr\.ee|litt\.ly|link\.inpock/i, "프로필 링크"],
];
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /01[016789]\d{7,8}/;
// 단독 숫자 덩어리 (7~11자리) — 가격·시각 단위가 붙지 않은 맨숫자는 연락처 파편으로 간주
const BARE_DIGITS_RE = /(?<![\d원장분시월일년,])\d{7,11}(?![\d원장분시월일년,])/;

export function detectOffPlatform(text: string): string[] {
  const raw = text.trim();
  if (!raw) return [];
  const t = normalize(raw);
  const matched: string[] = [];

  if (PHONE_RE.test(t)) matched.push("전화번호");
  else if (BARE_DIGITS_RE.test(t) && !/[원장,]/.test(raw)) matched.push("연락처 의심 숫자");

  for (const [re, label] of URL_RES) if (re.test(t)) matched.push(label);
  if (EMAIL_RE.test(t)) matched.push("이메일");
  if (PLATFORM_ID_RE.test(t)) matched.push("SNS 계정 공유");
  if (AT_HANDLE_RE.test(t) && (LURE_RE.test(t) || PLATFORM_RE.test(t))) matched.push("SNS 계정 공유");
  if (PLATFORM_RE.test(t) && LURE_RE.test(t)) matched.push("SNS·메신저 유도");

  return [...new Set(matched)];
}

/** 차단 시 사용자에게 보여줄 안내문 */
export const MODERATION_NOTICE =
  "개인 연락처·SNS 안내는 보낼 수 없어요. 사매 채팅에서 대화를 이어가 주세요.";

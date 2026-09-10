// 문의 챗봇 상태 머신 — 순수 로직(React 의존 없음).
//
// 기존 위저드(InquiryChat)의 질문 정의(STEPS)를 이곳으로 분리해
// 위저드와 챗봇(/inquiry/bot)이 같은 데이터를 공유한다.
// - 질문 문구는 QuestionSegment[](강조 여부만 가진 조각)로 두고, 각 UI가 렌더링 방식 결정
// - C2에서 작가 커스텀 질문(photographer_bot_questions)이 buildFlow()로 끼워진다
// - 제출 변환(toInquiryFields)은 위저드 submit과 동일 규칙 유지 (기존 submitInquiry 재사용 전제)

export type CoreStepKey = "purpose" | "preferredDate" | "region" | "partySize";
export type BotStepType = "options" | "date" | "text";

// 질문 문구 조각 — em=true 면 강조(위저드/챗봇의 <Em> 렌더링 대상)
export type QuestionSegment = { text: string; em?: boolean };

export type BotStep = {
  key: string; // 공통 질문은 CoreStepKey, 커스텀은 `custom:{id}`
  type: BotStepType;
  question: QuestionSegment[];
  options?: string[];
  cols?: 1 | 2; // options 레이아웃 (기본 2열)
  skip: string; // 질문별 맞춤 soft-skip (다른 선택지와 동등 버튼)
  short: string; // 요약 라벨
  ev: string; // Mixpanel 이벤트 접두어 — 질문마다 고유 이름("... Viewed" / "... Answered")
  custom?: boolean; // 작가 커스텀 질문 여부
};

// 공통 4문항 — 위저드 v2와 동일한 문구·선택지·소프트스킵.
// ⚠️ Q번호(ev)는 '순서'가 아니라 '고유 ID'다. 절대 당겨쓰지 말 것 (InquiryChat 상단 주석 참고).
export const CORE_STEPS: BotStep[] = [
  {
    key: "purpose",
    type: "options",
    question: [{ text: "어떤 사진 촬영을 원하시나요?" }],
    options: ["커플·우정 스냅", "웨딩", "개인·프로필", "단체·행사"],
    skip: "그 외 목적",
    short: "촬영 종류",
    ev: "Inquiry Q1 Purpose",
  },
  {
    key: "preferredDate",
    type: "date",
    question: [{ text: "촬영 " }, { text: "희망일", em: true }, { text: "을 선택해주세요." }],
    skip: "날짜는 미정이에요",
    short: "희망일",
    ev: "Inquiry Q2 Date",
  },
  {
    key: "region",
    type: "options",
    question: [{ text: "지역", em: true }, { text: "을 선택해주세요." }],
    options: ["서울", "경기·인천", "부산·경남", "대구·경북", "대전·충청", "광주·전라", "제주"],
    skip: "협의 후 결정",
    short: "지역",
    ev: "Inquiry Q3 Region",
  },
  {
    key: "partySize",
    type: "options",
    question: [{ text: "몇 분", em: true }, { text: "이 함께 찍으시나요?" }],
    options: ["1명", "2명", "3~6명", "그 이상"],
    cols: 1,
    skip: "미정",
    short: "인원",
    ev: "Inquiry Q4 Party Size",
  },
];

// ── 작가 커스텀 질문 (C2 인터페이스) ─────────────────────────────
// photographer_bot_questions 1행이 이 형태로 내려온다. options 가 비면 자유 입력.
export type CustomBotQuestion = {
  id: string;
  question: string;
  options?: string[];
};

const MAX_CUSTOM_QUESTIONS = 3;

// 질문 시퀀스 구성 — 공통 4문항 뒤에 작가 커스텀 질문(0~3개)을 잇는다.
// C1에선 인자 없이 호출(공통 4문항만). C2에서 스튜디오 설정값을 주입.
export function buildFlow(custom: CustomBotQuestion[] = []): BotStep[] {
  const customSteps: BotStep[] = custom.slice(0, MAX_CUSTOM_QUESTIONS).map((q, i) => ({
    key: `custom:${q.id}`,
    type: q.options && q.options.length > 0 ? "options" : "text",
    question: [{ text: q.question }],
    options: q.options && q.options.length > 0 ? q.options : undefined,
    skip: "잘 모르겠어요",
    short: `추가 질문 ${i + 1}`,
    // 커스텀 질문은 작가마다 달라 개별 퍼널이 아닌 QC{순번} 으로 집계
    ev: `Inquiry QC${i + 1} Custom`,
    custom: true,
  }));
  return [...CORE_STEPS, ...customSteps];
}

// ── 답변 상태 ────────────────────────────────────────────────────
// step.key → 사용자가 고른 원본 값(소프트스킵 라벨 포함). 날짜는 ISO(yyyy-mm-dd) 또는 빠른 칩 문구.
export type BotAnswers = Record<string, string>;

// 불변 갱신 — 답변 누적
export function answerStep(answers: BotAnswers, key: string, value: string): BotAnswers {
  return { ...answers, [key]: value };
}

// 순차 진행 가정 — 처음으로 답하지 않은 스텝 index. 전부 답했으면 steps.length.
export function nextStepIndex(steps: BotStep[], answers: BotAnswers): number {
  for (let i = 0; i < steps.length; i++) {
    if (answers[steps[i].key] === undefined) return i;
  }
  return steps.length;
}

export function isFlowComplete(steps: BotStep[], answers: BotAnswers): boolean {
  return nextStepIndex(steps, answers) >= steps.length;
}

export function answeredCount(steps: BotStep[], answers: BotAnswers): number {
  return steps.filter((s) => answers[s.key] !== undefined).length;
}

// ── 날짜 표기 (위저드와 동일 규칙) ───────────────────────────────
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

export function isISODate(v: string): boolean {
  return ISO_RE.test(v);
}

export function formatDateKo(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY[d.getDay()]})`;
}

// 저장값 → 화면 표시 문자열 (date 타입의 ISO 값만 한국어 표기로)
export function displayAnswer(step: BotStep, value: string): string {
  if (step.type === "date" && isISODate(value)) return formatDateKo(value);
  return value;
}

// ── 요약 카드 데이터 ─────────────────────────────────────────────
export type SummaryRow = {
  key: string;
  label: string; // step.short
  value: string; // 표시용 문자열 (소프트스킵이면 스킵 라벨 그대로)
  skipped: boolean;
};

// 전 질문 완료 시 게시하는 요약 카드의 행 목록. 답하지 않은 스텝은 제외.
export function buildSummaryRows(steps: BotStep[], answers: BotAnswers): SummaryRow[] {
  const rows: SummaryRow[] = [];
  for (const step of steps) {
    const raw = answers[step.key];
    if (raw === undefined) continue;
    rows.push({
      key: step.key,
      label: step.short,
      value: displayAnswer(step, raw),
      skipped: raw === step.skip,
    });
  }
  return rows;
}

// ── 제출 변환 (기존 submitInquiry FormData 규칙) ─────────────────
// 위저드 submit과 동일:
// - 미답변은 빈 문자열
// - partySize 소프트스킵은 값으로 저장하지 않고 미입력("") 처리
// - 날짜 ISO 값은 한국어 표기로 저장 (다른 스킵 라벨은 그대로 저장)
export function toInquiryFields(
  steps: BotStep[],
  answers: BotAnswers
): Record<CoreStepKey, string> {
  const fields: Record<CoreStepKey, string> = {
    purpose: "",
    preferredDate: "",
    region: "",
    partySize: "",
  };
  for (const step of steps) {
    if (step.custom) continue; // 커스텀 답변은 C2에서 별도 저장(bot_states.answers.custom)
    const key = step.key as CoreStepKey;
    const raw = answers[step.key];
    if (raw === undefined) continue;
    if (key === "partySize" && raw === step.skip) continue;
    fields[key] = displayAnswer(step, raw);
  }
  return fields;
}

// ── 연락처 유효성 (위저드 Q6과 동일 규칙) ────────────────────────
export type ContactType = "phone" | "kakao";

export const CONTACT_TYPES: {
  key: ContactType;
  label: string;
  short: string; // 아이콘 아래 짧은 라벨
  placeholder: string;
  inputMode: "tel" | "text";
  empty: string; // 빈칸일 때 안내문
}[] = [
  { key: "phone", label: "전화번호", short: "전화", placeholder: "010-1234-5678", inputMode: "tel", empty: "전화번호를 입력해주세요." },
  { key: "kakao", label: "카카오톡 ID", short: "카톡", placeholder: "카카오톡 ID", inputMode: "text", empty: "카카오톡 ID를 입력해주세요." },
];

// 카카오톡 아이디 — 영문 소문자·숫자·마침표(.)·밑줄(_) 4~20자 (대문자·하이픈 불가)
const KAKAO_RE = /^[a-z0-9._]{4,20}$/;

// 전화번호 — "-" 없이 입력해도 자동으로 하이픈 삽입
export function formatPhoneInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

// 카톡 ID — 소문자만 허용: 대문자는 자동 소문자화, 허용 외 문자는 제거, 20자 캡
export function formatKakaoInput(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 20);
}

export function validateContact(
  type: ContactType,
  raw: string
): { valid: boolean; error: string | null } {
  const v = raw.trim();
  if (!v) return { valid: false, error: null };
  if (type === "phone") {
    const d = v.replace(/\D/g, "");
    if (d.length !== 11 || !d.startsWith("01"))
      return { valid: false, error: "010으로 시작하는 11자리를 입력해주세요." };
    return { valid: true, error: null };
  }
  if (!KAKAO_RE.test(v)) return { valid: false, error: "4자 이상 입력해주세요." };
  return { valid: true, error: null };
}

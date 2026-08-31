// 작가 문의대본 — LLM 챗봇의 질문 유도를 작가별로 커스텀하는 대본.
//
// 실제 부검에서 본 패턴을 대본으로 흡수한다 (챗봇_설계.md §0-4 "작가 양식의 흡수"):
// 작가들이 사전 양식(공통양식·질문지)을 채팅에 던지는 대신, 봇이 그 질문들을
// 자연스러운 대화로 유도해 수집한다.
//
// C1.5(현재): 파일 기반 데모 — 기본 대본 + 작가별 커스텀 대본 2개.
// TODO(C2): photographer_bot_questions 테이블로 이관 — 스튜디오 설정 UI에서
//           작가가 직접 tone/customQuestions 를 편집하고, 이 파일은 폴백 기본값만 남긴다.

export type PhotographerScript = {
  /** 대본 식별자 — 로그·디버그용 */
  id: string;
  /** 봇의 인사·말투 지시 (시스템 프롬프트에 주입) */
  tone: string;
  /**
   * 공통 4슬롯(목적·희망일·지역·인원) 수집 후 이어서 유도할 작가별 질문.
   * 최대 3개 — 봇이 이 문구를 그대로 읽지 않고 대화 맥락에 맞게 묻는다.
   */
  customQuestions: string[];
};

export const MAX_SCRIPT_QUESTIONS = 3;

// 기본 대본 — 커스텀 대본이 없는 모든 작가에게 적용.
export const DEFAULT_SCRIPT: PhotographerScript = {
  id: "default",
  tone: "따뜻하고 간결한 존댓말. 이모지는 쓰지 않는다. 부담 주지 않는 상담원 톤.",
  customQuestions: [],
};

// 작가별 커스텀 대본 (파일 기반 데모 2개 — dev DB의 실제 작가 ID에 매핑)
const CUSTOM_SCRIPTS: Record<string, PhotographerScript> = {
  // 모글 — 컨셉 촬영 중심 작가 패턴: 원하는 배경·분위기·세계관을 먼저 그려보게 한다
  "7a3adcb6-a03d-4faf-bbd3-5e59c2c3c503": {
    id: "concept",
    tone: "감성적이지만 담백한 존댓말. 촬영을 '어떤 장면을 만들고 싶은지'의 관점으로 묻는다.",
    customQuestions: [
      "원하시는 배경이나 분위기가 있나요? (예: 필름 감성, 도심 야경, 자연광)",
      "표현하고 싶은 컨셉이나 세계관이 있다면 자유롭게 들려주세요.",
    ],
  },
  // 무루필름 — 레퍼런스·보정 확인 패턴: 기대치를 먼저 맞추는 작가
  "97d2b1c8-050b-4c80-b444-788b1410a784": {
    id: "reference",
    tone: "차분하고 신뢰감 있는 존댓말. 기대하는 결과물을 구체화하도록 돕는다.",
    customQuestions: [
      "참고하고 싶은 레퍼런스 이미지가 있으신가요? 있다면 어떤 느낌인지 설명해주세요.",
      "보정 스타일 희망이 있나요? (예: 자연스러운 톤, 화사한 보정, 필름룩)",
    ],
  },
};

/** 작가 문의대본 조회 — 커스텀 대본이 없으면 기본 대본 */
export function getPhotographerScript(photographerId: string): PhotographerScript {
  const custom = CUSTOM_SCRIPTS[photographerId];
  if (!custom) return DEFAULT_SCRIPT;
  return {
    ...custom,
    customQuestions: custom.customQuestions.slice(0, MAX_SCRIPT_QUESTIONS),
  };
}

/** 커스텀 대본 보유 여부 — 디버그·데모 화면 표기용 */
export function hasCustomScript(photographerId: string): boolean {
  return photographerId in CUSTOM_SCRIPTS;
}

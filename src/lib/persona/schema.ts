// Anthropic SDK의 zodOutputFormat 헬퍼가 zod v4 타입을 요구하므로 v4 서브패스 사용.
// (samae 나머지 코드의 zod v3와 공존 — 이 스키마는 Claude structured output 전용)
import { z } from "zod/v4";

// Stage1 심리 프로파일 스키마 — Claude structured outputs로 강제.
// (woori-mirae `report/schema.ts`의 PersonaSchema 포팅. 관계·미래 예측(ReportCore)은
//  samae에서 쓰지 않으므로 제외 — 그 자리에 Stage2 ShootPersonaSchema가 들어감)

const Trait = z.object({
  score: z.number().describe("0~100 점수"),
  note: z.string().describe("이 점수를 준 구체적 근거 한 문장 (실제 신호 인용)"),
});

export const PersonaSchema = z.object({
  oneLiner: z.string().describe("이 사람이 '어떤 사람'인지 관통하는 한 줄 (직업/활동이 아니라 성격·태도)"),

  bigFive: z.object({
    openness: Trait.describe("개방성: 새로움·다양함·경험 추구"),
    conscientiousness: Trait.describe("성실성: 계획성·꾸준함·자기관리"),
    extraversion: Trait.describe("외향성: 에너지 방향·사교·표현"),
    agreeableness: Trait.describe("우호성: 공감·배려·관계 지향"),
    emotionalStability: Trait.describe("정서안정성: 감정 기복이 적고 차분한 정도 (높을수록 안정적)"),
  }),

  attachment: z.object({
    style: z.enum(["secure", "anxious", "avoidant", "fearful"]).describe("애착유형: 안정/불안/회피/혼란"),
    label: z.string().describe("애착유형 한국어 라벨 예: '안정형', '불안형'"),
    reason: z.string().describe("이 애착유형으로 본 근거 (관계·표현 신호 기반)"),
  }),

  loveStyle: z.string().describe("연애할 때 어떤 사람일지 2~3문장 (표현/거리감/애정방식)"),
  values: z.array(z.string()).describe("삶에서 중요하게 여기는 가치 2~4개 (데이터에서 읽히는 것)"),
  lifestyle: z.string().describe("생활 리듬·에너지 패턴 한 문장 (게시 텀·활동성 근거)"),
  socialTendency: z.string().describe("사람과 관계 맺는 방식 한 문장 (팔로우 비율·상호작용 근거)"),

  evidence: z
    .array(z.string())
    .describe("위 프로파일의 핵심 근거 3~5개. '신호 → 해석' 형태. 예: '평균 간격 8일·규칙적 → 자기 페이스가 뚜렷하고 꾸준한 편'"),
});

export type Persona = z.infer<typeof PersonaSchema>;

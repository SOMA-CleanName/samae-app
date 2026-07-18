// Stage2 — 심리 페르소나 → samae 촬영 페르소나·태그 매핑 스키마.
// (이 프로젝트의 유일한 net-new. Stage1 심리 결과를 samae 서비스 축으로 번역)
// zodOutputFormat이 zod v4 타입을 요구하므로 v4 서브패스 사용 ([[instagram-persona-matching]] 참고).
import { z } from "zod/v4";

const MoodReason = z.object({
  moodTitle: z.string().describe("고른 무드 카테고리의 title (입력으로 준 목록의 title 그대로)"),
  signal: z.string().describe("피드에서 관찰된 실제 신호 (예: '게시물 78%가 따뜻한 자연광·필름 톤')"),
  why: z.string().describe("그래서 이 무드가 어울리는 이유 (심리+미감 결합, 단정 금지)"),
});

export const ShootPersonaSchema = z.object({
  shootPersonaLabel: z.string().describe("촬영 페르소나 라벨 1개. 예: '감성 필름 도심 산책러'"),

  purposeKey: z
    .enum(["wedding", "couple", "personal"])
    .describe("촬영 목적. 커플 2인 반복↑→couple, 웨딩/드레스 신호→wedding, 셀피·단독 인물↑→personal(기본값)"),

  moodIds: z
    .array(z.string())
    .describe("어울리는 무드 카테고리 id 1~3개. 반드시 입력으로 준 무드 목록의 id 중에서만 고를 것"),

  moodReasons: z
    .array(MoodReason)
    .describe("고른 무드 각각의 근거. moodIds와 개수·순서를 맞출 것"),

  colorPalette: z.array(z.string()).describe("대표 컬러 팔레트 hex 3~5개 (예: '#f4f1ea')"),

  shootTypes: z.array(z.string()).describe("어울리는 촬영 유형 1~3개 (예: '자연광 야외 스냅')"),
  locations: z.array(z.string()).describe("어울리는 로케이션 1~3개 (예: '도심 골목', '카페')"),

  psychHook: z
    .string()
    .describe("심리를 건드리는 후킹 카피 2~3문장. 사용자의 성향을 짚어주되 평가·단정은 금지, 촬영 제안 톤"),
});

export type ShootPersona = z.infer<typeof ShootPersonaSchema>;

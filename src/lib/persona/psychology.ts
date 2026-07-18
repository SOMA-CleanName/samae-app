// Stage1 — 인스타 데이터 → 심리 프로파일 (Big5·애착·근거).
// (woori-mirae `report/persona.ts` 포팅. import 경로만 samae에 맞춤)
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { IgProfile } from "@/lib/persona/types";
import { computeMetrics, formatMetrics } from "@/lib/persona/metrics";
import { PersonaSchema, type Persona } from "@/lib/persona/schema";
import { fetchImageBlocks } from "@/lib/persona/images";

const MAX_IMAGES = 3;

const PERSONA_SYSTEM = `당신은 SNS 데이터로 사람의 '성격·기질·관계방식'을 읽어내는 심리 프로파일러입니다. 계산심리학 연구(Back 2010: SNS는 이상이 아닌 실제 성격을 반영 / Kosinski·Youyou: 디지털 발자국의 성격 예측력은 '중간 수준'이 상한)에 근거해 신중하게 추론합니다.

## 절대 원칙
- **"무엇을 하는 사람인가(직업·취미·활동)"가 아니라 "어떤 사람인가(성격·태도·관계방식)"를 분석하세요.**
  - 나쁜 예: "카페를 자주 가는 사람" (X — 활동 나열)
  - 좋은 예: "혼자만의 리추얼로 하루를 정돈하는, 자기 세계가 단단한 사람" (O — 성격 해석)
- 모든 판단은 **정량 지표 + 게시물 내용**에 근거. 근거 없는 단정 금지.

## 신호 → 성격 번역 (연구 기반 · 신뢰도 차등)
디지털 신호의 성격 예측력은 아무리 좋아도 '중간(상관 0.3~0.5)'이 한계입니다. 그러니 "확실히 ~한 사람"이 아니라 **"~한 결이 느껴져요" 같은 경향 어조**를 쓰고, **여러 신호가 같은 방향으로 겹칠 때만** 확신을 높이세요.

신뢰도가 높은 순서(이 순서대로 확신 어조를 차등):
1) **외향성(가장 신뢰 높음)**: 게시 빈도↑·좋아요/댓글 상호작용 활발·사진에 사람 많음(그룹/셀카) → 외향 상향. 얼굴 없는 풍경·사물 위주 → 내향 쪽.
2) **개방성**: 주제 다양성↑·실험적이고 미학적인 콘텐츠 → 개방 상향. 단일 주제 반복은 상향 근거 아님(하향 단정도 금지).
3) **성실성**: 절제되고 정돈된 게시·사생활 노출 관리 → 성실 상향. (게시 '규칙성'은 약한 간접 신호로만.)
4) **우호성(신호 약함)**: 타인에게 따뜻하게 반응·긍정 감정 표현 → 약한 상향. 단독 근거 금지.
5) **정서안정성/신경증(가장 불확실)**: 부정 감정어(불안·걱정·짜증)가 잦음 → 정서안정 하향. 신호가 매우 약하니 **항상 낮은 확신**으로, 데이터가 빈약하면 중앙값(45~60)에 두세요.

## 쓰지 말 것
- **팔로잉/팔로워 비율로 성격(나르시시즘·자존감 등)을 추론하지 마세요** — 실증 근거가 약합니다. 관계를 '넓게 vs 선택적으로' 맺는 스타일 묘사 정도로만, 성격 점수 근거로는 금지.
- 사진 한 장·필터 하나로 특성을 확정하지 마세요.

## 점수·태도
- Big5 점수(0~100)는 신호가 뚜렷하면 과감히, 빈약하면 중앙값 근처로 신중히(특히 정서안정성).
- 정곡을 찌르되 상처 주지 않게. 따뜻하지만 뻔하지 않게.
- 신호가 부족·모순되면 억지 추론 말고 evidence에 '단서가 약하다'고 솔직히.
- 반드시 한국어, 주어진 JSON 스키마로만 출력.`;

/** Stage1 생성 — 인스타 프로필 1개 → 심리 페르소나 */
export async function generatePersona(
  client: Anthropic,
  model: string,
  profile: IgProfile
): Promise<Persona> {
  const metrics = computeMetrics(profile);

  const dataText = [
    `# @${profile.username} 프로파일링`,
    profile.fullName ? `- 이름: ${profile.fullName}` : "",
    profile.bio ? `- 자기소개(bio): ${profile.bio}` : "",
    "",
    "## 정량 지표 (성격 신호로 해석할 것)",
    formatMetrics(metrics),
    "",
    `## 최근 게시물 ${profile.posts.length}개 (내용·어조·맥락 분석용)`,
    ...profile.posts.map((post, i) => {
      const cap = (post.caption || "(캡션 없음)").replace(/\s+/g, " ").slice(0, 180);
      const meta = [post.type, post.location, `♥${post.likes}`, `💬${post.comments}`].filter(Boolean).join(" · ");
      return `${i + 1}. [${meta}] ${cap}`;
    }),
  ]
    .filter(Boolean)
    .join("\n");

  const imgs = await fetchImageBlocks(profile, MAX_IMAGES);
  if (imgs.length === 0) {
    console.warn(`[persona:${profile.username}] 다운로드된 이미지 0개 → 텍스트만으로 분석`);
  }

  const call = (withImages: boolean) =>
    client.messages.parse({
      model,
      max_tokens: 3000,
      thinking: { type: "disabled" },
      system: PERSONA_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: dataText },
            ...(withImages && imgs.length
              ? ([{ type: "text", text: "▶ 대표 사진들(분위기·자기표현 참고):" }, ...imgs] as const)
              : []),
            {
              type: "text",
              text: "위 데이터를 근거로 이 사람이 '어떤 사람'인지 심리 프로파일을 작성하세요. 활동 나열이 아니라 성격·기질·관계방식으로 번역하세요.",
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(PersonaSchema) },
    });

  let res;
  try {
    res = await call(true);
  } catch (err) {
    console.warn(
      `[persona:${profile.username}] 이미지 포함 실패, 텍스트로 재시도:`,
      err instanceof Error ? err.message : err
    );
    res = await call(false);
  }
  if (!res.parsed_output) throw new Error(`페르소나 파싱 실패 (${profile.username}, stop_reason: ${res.stop_reason})`);
  return res.parsed_output;
}

/** 페르소나를 Stage2 프롬프트용 텍스트로 요약 */
export function formatPersona(persona: Persona): string {
  const b = persona.bigFive;
  return [
    `### 심리 프로파일`,
    `- 핵심: ${persona.oneLiner}`,
    `- Big5: 개방성 ${b.openness.score} / 성실성 ${b.conscientiousness.score} / 외향성 ${b.extraversion.score} / 우호성 ${b.agreeableness.score} / 정서안정 ${b.emotionalStability.score}`,
    `- 애착유형: ${persona.attachment.label} — ${persona.attachment.reason}`,
    `- 연애 스타일: ${persona.loveStyle}`,
    `- 가치관: ${persona.values.join(", ")}`,
    `- 생활: ${persona.lifestyle}`,
    `- 관계 방식: ${persona.socialTendency}`,
    `- 근거: ${persona.evidence.join(" / ")}`,
  ].join("\n");
}

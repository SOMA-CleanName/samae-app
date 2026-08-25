// Stage1+Stage2 병합 호출 — 사진을 **한 번만** 올리고 심리·촬영 페르소나를 함께 받는다.
//
// 왜 합쳤나 (2026-08-20 실측):
//   사진 준비 1.1s · Stage1 28.0s · Stage2 32.3s  → 총 61s. 전부 LLM 이었다.
//   두 호출이 **같은 사진을 두 번 업로드**하고 있었다(9장 + 6장). 비전 호출에서
//   지연의 대부분은 이미지 입력 처리라, 같은 사진을 두 번 보내는 건 그대로 두 배 비용이다.
//
// 합치면 얻는 것
//   · 이미지 업로드 1회 → 지연·토큰 모두 절반 가까이
//   · 심리→무드 연결이 한 맥락 안에서 이뤄진다 (기존엔 Stage1 결과를 텍스트로 요약해 넘겼다)
//
// 잃지 않는 것
//   · 저장 포맷(Persona / ShootPersona)은 그대로 유지한다 — 생성하지 않는 필드는
//     빈 값으로 채워 넣어, 이전에 저장된 결과와 공유 링크가 계속 열린다.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { type Persona } from "@/lib/persona/schema";
import { ShootPersonaSchema, type ShootPersona } from "@/lib/persona/shoot-schema";
import { PURPOSE_OPTIONS } from "@/lib/taste-purposes";
import type { PersonaImageBlock } from "@/lib/persona/images";

// ⚠️ 전체 스키마가 아니라 **화면에 실제로 쓰이는 필드만** 생성시킨다.
//
// 측정으로 드러난 것(2026-08-20): 두 호출을 하나로 합쳐도 61s → 54s 밖에 안 줄었다.
// 병목이 이미지 입력이 아니라 **출력 토큰 생성**이었기 때문이다.
// 그런데 기존 스키마는 결과 화면이 읽지도 않는 값을 잔뜩 만들고 있었다 —
// loveStyle · values · lifestyle · socialTendency · shootTypes · bigFive 의 note 5개.
// 아무도 안 보는 문장을 만드느라 사용자를 기다리게 할 이유가 없다.
// ⚠️ 글자수 제한이 이 스키마의 핵심이다 (2026-08-25 재설계).
// 결과는 모바일 카드 UI 에 그대로 얹힌다 — 장문 문단은 화면에서 덩어리로 죽는다.
// "짧게 쓰라"는 문장 지시는 값싼 모델이 흘리므로, 필드마다 구체적 글자수·형식을 박는다.
const SlimTrait = z.object({ score: z.number().describe("0~100 점수") });

const SlimPersonaSchema = z.object({
  oneLiner: z
    .string()
    .describe(
      "'어떤 사람인지' 관통하는 한 줄. 10~22자, 명사형 종결·마침표 없음 " +
        "(직업·활동이 아니라 성격·태도. 예: '고요한 순간을 골라내는 사람')"
    ),
  bigFive: z.object({
    openness: SlimTrait.describe("개방성: 새로움·다양함·경험 추구"),
    conscientiousness: SlimTrait.describe("성실성: 계획성·꾸준함·자기관리"),
    extraversion: SlimTrait.describe("외향성: 에너지 방향·사교·표현"),
    agreeableness: SlimTrait.describe("우호성: 타인에 대한 태도"),
    emotionalStability: SlimTrait.describe("정서안정: 감정 기복·스트레스 반응"),
  }),
  attachment: z.object({
    style: z.enum(["secure", "anxious", "avoidant", "fearful"]),
    label: z.string().describe("한국어 라벨. 예: '안정 애착'"),
    reason: z.string().describe("그렇게 본 근거. 해요체 완결 1문장 30자 이내 (명사 나열 금지)"),
  }),
  evidence: z
    .array(z.string())
    .min(3)
    .max(4)
    .describe(
      "판단 근거 3~4개. 각각 사진·데이터에서 실제 관찰한 것 **정확히 1문장, 26자 이내** " +
        "(예: '창가 자연광의 정적인 컷이 반복돼요'). 관찰 뒤에 해석 문장을 잇지 말 것"
    ),
});

// 개수를 스키마로 못 박는다.
// 값싼 모델일수록 "2~3개" 라는 문장 지시를 흘리고 1~2개만 낸다 —
// 실측(haiku-4.5)에서 프로필에 따라 근거가 3.0 → 2.0 개로 떨어졌다.
// 스키마 제약은 프롬프트와 달리 디코딩 단계에서 강제된다.
const SlimShootSchema = z.object({
  shootPersonaLabel: z
    .string()
    .describe("촬영 페르소나 라벨. 8~14자 명사형 (예: '빛을 모으는 필름 산책자')"),
  keywords: z
    .array(z.string())
    .min(3)
    .max(3)
    .describe(
      "당신을 요약하는 키워드 정확히 3개. **공백 없는 한 단어 명사, 각 2~5자** " +
        "(예: '새벽빛', '기록', '여백'). '차분한 회색톤' 같은 수식어구·문장·조사 금지"
    ),
  purposeKey: ShootPersonaSchema.shape.purposeKey,
  moodIds: z
    .array(z.string())
    .min(2)
    .max(3)
    .describe("어울리는 무드 카테고리 id 2~3개. 반드시 입력으로 준 무드 목록의 id 중에서만"),
  moodReasons: z
    .array(
      z.object({
        moodTitle: z.string().describe("고른 무드의 title 그대로"),
        signal: z
          .string()
          .describe(
            "사진에서 **직접 관찰한 시각 특성**의 명사구 요약. 10~20자, 문장 금지 " +
              "(색온도·채도·계조·그레인·명암대비·여백·피사체 중 1개 이상. " +
              "예: '따뜻한 색온도와 필름 그레인')"
          ),
        why: z
          .string()
          .describe(
            "그래서 이 무드가 어울리는 이유. '~해서 ~가 어울려요' 꼴 해요체 **정확히 1문장, 40자 이내**, 단정 금지. " +
              "**keywords 로 낸 단어 중 하나를 반드시 그대로 포함**해 성격과 무드를 이을 것 " +
              "(예: 키워드 '잔잔함' → '잔잔함이 밴 장면들이라 여백 많은 이 무드가 어울려요'). 두 문장 잇기 금지"
          ),
        photoIndexes: z
          .array(z.number().int().min(1))
          .min(1)
          .max(3)
          .describe("이 무드의 근거가 된 사진 번호 1~3개 (아래에 매긴 '사진 N' 번호 그대로)"),
      })
    )
    .min(2)
    .max(3)
    .describe("moodIds 와 개수·순서를 맞출 것"),
  psychHook: z
    .string()
    .describe(
      "심리를 짚는 감성 카피 정확히 2문장, 각 30자 이내. 캡처해서 인스타에 옮기고 싶은 문장으로. " +
        "평가·단정 금지 (예: '당신은 빛이 머무는 자리를 알아보는 사람이에요. 사진은 그 시선을 남기는 가장 조용한 방법이고요.')"
    ),
  paletteReason: z
    .string()
    .describe(
      "대표 색 팔레트가 피드의 **어떤 장면**에서 왔는지 해요체 1문장 26자 이내 " +
        "(예: '창가 노을과 원목 가구에서 반복된 색이에요'). 실제로 본 장면만, 색이름 나열 금지"
    ),
  locations: ShootPersonaSchema.shape.locations,
});

const CombinedSchema = z.object({
  persona: SlimPersonaSchema,
  shoot: SlimShootSchema,
});

const SYSTEM = `당신은 SNS 사진과 데이터를 읽어 (1) 그 사람의 성격, (2) 어울리는 촬영 무드를 함께 판단하는 전문가입니다.

## 1부 · 심리 프로파일 (persona)
계산심리학 연구(Back 2010: SNS 는 이상이 아닌 실제 성격을 반영 / Kosinski·Youyou: 디지털 발자국의 성격 예측력은 '중간 수준'이 상한)에 근거해 신중하게 추론합니다.

- **"무엇을 하는 사람인가(직업·취미·활동)"가 아니라 "어떤 사람인가(성격·태도·관계방식)"를 쓰세요.**
  - 나쁜 예: "카페를 자주 가는 사람" (X — 활동 나열)
  - 좋은 예: "혼자만의 리추얼로 하루를 정돈하는, 자기 세계가 단단한 사람" (O)
- 신뢰도 순서대로 확신 어조를 차등하세요.
  1) **외향성(가장 신뢰 높음)**: 게시 빈도↑·상호작용 활발·사진에 사람 많음 → 외향 상향. 얼굴 없는 풍경·사물 위주 → 내향 쪽.
  2) **개방성**: 주제 다양성↑·실험적/미학적 콘텐츠 → 상향. 단일 주제 반복은 상향 근거 아님(하향 단정도 금지).
  3) **성실성**: 절제되고 정돈된 게시·사생활 노출 관리 → 상향.
  4) **우호성(신호 약함)**: 따뜻한 반응·긍정 감정 → 약한 상향. 단독 근거 금지.
  5) **정서안정성(가장 불확실)**: 부정 감정어가 잦음 → 하향. 신호가 매우 약하니 데이터가 빈약하면 중앙값(45~60).
- **팔로잉/팔로워 비율로 성격을 추론하지 마세요** — 실증 근거가 약합니다.
- 사진 한 장·필터 하나로 특성을 확정하지 마세요. "확실히 ~한 사람"이 아니라 **"~한 결이 느껴져요"** 같은 경향 어조.

## 2부 · 촬영 페르소나·무드 (shoot)

### 사진을 먼저 보세요 (가장 중요)
무드는 심리 요약이 아니라 **사진의 실제 시각 특성**에서 나옵니다. 직접 관찰하세요.
- **색온도**: 따뜻함(주황·황금빛) vs 차가움(푸른빛·중성)
- **밝기·계조**: 하이키/밝고 통풍감 vs 로우키/어둡고 무거움, 대비의 세기
- **질감**: 필름 그레인·빛바램 vs 디지털 선명함·매끈함
- **채도**: 쨍한 원색 vs 탈색된 뮤트 톤 vs 흑백
- **구도·공간**: 여백이 많은 미니멀 vs 화면을 꽉 채운 밀도
- **피사체**: 인물 단독 / 2인 / 그룹, 실내 vs 야외, 자연 vs 도시

한 장의 예외가 아니라 **여러 장에서 반복되는 패턴**을 잡으세요. 사진이 서로 크게 다르면 억지로 묶지 말고 가장 자주 나오는 톤을 기준으로 삼되 그 사실을 evidence 에 적으세요.

### 목적(purposeKey)
- 커플 2인 구성이 반복 → couple / 웨딩·드레스·본식 신호 → wedding / 셀피·단독 인물 → personal (애매하면 personal)

### 무드(moodIds)
- **사진으로 관찰한 시각 특성**이 1차 근거, 심리(개방성↑→실험적·에디토리얼, 정서안정↑→내추럴·데일리, 외향성↑→활동적·밝은)가 2차 보정.
- 충돌하면 **사진 우선**. 무드는 결과물의 룩이고, 그 사람이 이미 고르고 있는 룩이 가장 강한 증거입니다.
- moodIds 에는 **입력 목록에 있는 id만**. 목록에 없는 무드를 지어내지 마세요.
- **무드는 반드시 2~3개**, moodReasons 도 같은 개수로. 하나만 내지 마세요.
- moodReasons 의 signal 은 **모두** 위 목록(색온도·밝기·질감·채도·구도·피사체) 중 하나 이상을 구체적으로 언급해야 합니다.
- moodReasons 의 photoIndexes 에는 그 무드의 근거가 된 **사진 번호 1~3개**를 넣으세요. signal 이 말하는 바로 그 사진이어야 합니다.
  - O: "6장 중 5장이 텅스텐 조명 아래 주황빛 색온도예요. 필름 그레인도 뚜렷해요"
  - X: "감성적인 취향", "일상을 소중히 여기는 태도" (사진을 안 봐도 쓸 수 있는 말)
- moodReasons 의 why 는 **keywords 중 한 단어를 그대로 인용**하세요 — 결과 화면에서 성격 카드와 무드 카드가 같은 단어로 이어져 "내 성격이 이래서 이 무드"라는 서사가 됩니다. (키워드 반복 금지 규칙의 유일한 예외)

### 출력 길이 계약 (초과는 실패 — 이 결과는 모바일 카드 UI 에 그대로 얹힙니다)
| 필드 | 제한 |
|---|---|
| shootPersonaLabel | 명사형 8~14자 |
| keywords | 공백 없는 한 단어 명사 3개, 각 2~5자 |
| oneLiner | 명사형 종결 10~22자, 마침표 없음 |
| psychHook | 정확히 2문장, 각 30자 이내 |
| attachment.reason | 해요체 1문장 30자 이내 |
| evidence 각 항목 | 정확히 1문장 26자 이내 |
| moodReasons.signal | 명사구 10~20자, 문장 금지 |
| moodReasons.why | 해요체 1문장 40자 이내 + **모든 무드마다** keywords 중 1개 그대로 포함 |
| paletteReason | 해요체 1문장 26자 이내 |

**어떤 필드에도 문장 두 개를 이어붙이지 마세요** (psychHook 제외). 마침표는 문장당 하나. 글자수를 넘길 것 같으면 수식어를 버리고 짧게 끝내세요.

### 톤 (모든 출력 필드 공통 — 이 규칙이 결과 품질을 결정합니다)
- **해요체 존댓말. 상대는 '당신'. '너·네·그대' 금지.** (예: "당신의 피드에는 ~가 반복돼요" O / "네 사진은~" X)
- **감성 카피 톤**: 설명하지 말고 짚으세요. 캡처해서 인스타에 옮기고 싶은, 짧고 단정한 문장. 수식어를 겹치지 말고(형용사 최대 1개씩) 구체적 이미지 하나로 말하세요.
- 같은 단어를 여러 필드에서 반복하지 마세요. psychHook·oneLiner·keywords 가 서로 다른 면을 비추면 결과가 풍성해 보입니다. (예외: moodReasons.why 는 keywords 중 하나를 일부러 다시 씁니다)
- psychHook 은 성향을 정확히 짚어 '나를 이렇게 봐주네' 싶게 하되, 평가·단정·부정 프레이밍 금지.
- 반드시 한국어, 주어진 JSON 스키마로만 출력. **스키마에 없는 필드는 만들지 마세요.**`;

/** 심리 + 촬영 페르소나를 한 번의 비전 호출로 생성. 무드는 서버측에서 유효 id 만 남긴다. */
export async function generateCombinedPersona(
  client: Anthropic,
  model: string,
  dataText: string,
  imgs: PersonaImageBlock[],
  moodCatalog: Array<{ id: string; title: string }>
): Promise<{ persona: Persona; shoot: ShootPersona }> {
  const purposeText = PURPOSE_OPTIONS.map((p) => `- ${p.key}: ${p.label} (${p.subtext})`).join("\n");
  const moodText = moodCatalog.map((m) => `- id=${m.id} · ${m.title}`).join("\n");

  const prompt = [
    dataText,
    "",
    "## 선택 가능한 촬영 목적",
    purposeText,
    "",
    "## 선택 가능한 무드 카테고리 (이 목록 안에서만 moodIds 선택)",
    moodText || "(등록된 공개 무드 없음 — moodIds 는 빈 배열로 두세요)",
  ].join("\n");

  const call = (withImages: boolean) =>
    client.messages.parse({
      model,
      max_tokens: 4000,
      thinking: { type: "disabled" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            ...(withImages && imgs.length
              ? ([
                  {
                    type: "text",
                    text: `▶ 피드 전체에서 고르게 뽑은 사진 ${imgs.length}장. 최근 몇 장이 아니라 기간을 넓게 표집한 것이니, 한 장의 예외보다 반복되는 패턴을 보세요. 각 사진 앞의 번호를 photoIndexes 에 그대로 쓰세요:`,
                  },
                  // 번호 라벨을 사진 사이에 끼운다 — "사진 3" 같은 참조가 정확해진다
                  ...imgs.flatMap((img, i) => [
                    { type: "text" as const, text: `사진 ${i + 1}:` },
                    img,
                  ]),
                ] as const)
              : []),
            {
              type: "text",
              text: imgs.length
                ? "사진에서 반복되는 시각 특성을 먼저 짚고, 거기에 심리 프로파일을 겹쳐 1부(persona)와 2부(shoot)를 함께 작성하세요."
                : "위 데이터를 근거로 1부(persona)와 2부(shoot)를 작성하세요.",
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(CombinedSchema) },
    });

  let res;
  try {
    res = await call(true);
  } catch (err) {
    // 이미지 때문에 실패했을 수 있으니(용량·형식) 텍스트로 재시도 — 품질은 떨어져도 결과는 나온다
    console.warn("[persona] 병합 호출 실패, 텍스트로 재시도:", err instanceof Error ? err.message : err);
    res = await call(false);
  }
  if (!res.parsed_output) throw new Error(`페르소나 파싱 실패 (stop_reason: ${res.stop_reason})`);

  const { persona: slim, shoot } = res.parsed_output;

  // 서버측 검증 — 목록 밖 무드는 걸러내고 moodReasons 도 유효한 것만 유지
  const validIds = new Set(moodCatalog.map((m) => m.id));
  const titleById = new Map(moodCatalog.map((m) => [m.id, m.title]));
  const keptIds = shoot.moodIds.filter((id) => validIds.has(id));
  const keptTitles = new Set(keptIds.map((id) => titleById.get(id)));

  // 생성하지 않은 필드는 빈 값으로 채운다 — 저장 포맷·타입을 그대로 유지해
  // 이전에 저장된 결과와 공유 링크가 계속 열리게 한다.
  const persona: Persona = {
    oneLiner: slim.oneLiner,
    bigFive: {
      openness: { score: slim.bigFive.openness.score, note: "" },
      conscientiousness: { score: slim.bigFive.conscientiousness.score, note: "" },
      extraversion: { score: slim.bigFive.extraversion.score, note: "" },
      agreeableness: { score: slim.bigFive.agreeableness.score, note: "" },
      emotionalStability: { score: slim.bigFive.emotionalStability.score, note: "" },
    },
    attachment: slim.attachment,
    loveStyle: "",
    values: [],
    lifestyle: "",
    socialTendency: "",
    evidence: slim.evidence,
  };

  return {
    persona,
    shoot: {
      ...shoot,
      colorPalette: [], // 서버가 사진에서 직접 추출해 덮어쓴다 (palette.ts)
      shootTypes: [],
      moodIds: keptIds,
      moodReasons: shoot.moodReasons
        .filter((r) => keptTitles.has(r.moodTitle))
        .map((r) => ({
          ...r,
          // 모델이 범위 밖 번호를 낼 수 있다 — 실제 표본 안의 번호만 남긴다
          photoIndexes: (r.photoIndexes ?? []).filter((n) => n >= 1 && n <= imgs.length).slice(0, 3),
        })),
    },
  };
}

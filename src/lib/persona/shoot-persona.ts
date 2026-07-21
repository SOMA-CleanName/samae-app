// Stage2 생성 — 심리 페르소나 + 지표 + 런타임 무드 카탈로그 → 촬영 페르소나·samae 태그.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Persona } from "@/lib/persona/schema";
import { formatPersona } from "@/lib/persona/psychology";
import { ShootPersonaSchema, type ShootPersona } from "@/lib/persona/shoot-schema";
import { PURPOSE_OPTIONS } from "@/lib/taste-purposes";

const SHOOT_SYSTEM = `당신은 사람의 '심리 프로파일'과 인스타 미감 신호를 받아, 그 사람에게 어울리는 **촬영 페르소나**와 samae 서비스의 **촬영 목적·무드**를 매핑하는 촬영 디렉터입니다.

## 입력
- 이미 분석된 심리 프로파일(Big5·애착·연애 스타일·가치관·생활·관계 방식·근거)
- 그 사람의 인스타 정량 지표(게시 리듬·표현·콘텐츠 구성 등)
- **선택 가능한 무드 카테고리 목록** (id + title) — 반드시 이 목록 안에서만 무드를 고르세요.

## 목적(purposeKey) 판별
- 커플 2인 구성이 반복적으로 보이면 → couple
- 웨딩/드레스/본식 신호가 있으면 → wedding
- 셀피·단독 인물 중심이면 → personal (신호가 애매하면 기본값도 personal)

## 무드(moodIds) 매핑 규칙
- **비전 톤**(따뜻/차가움, 필름/디지털, 밝음/다크, 미니멀)과 **심리**(개방성↑→실험적·에디토리얼, 정서안정↑→내추럴·데일리, 외향성↑→활동적·밝은)를 종합해, 주어진 무드 title의 의미와 가장 잘 맞는 것을 1~3개 고르세요.
- moodIds에는 **입력 목록에 있는 id만** 넣으세요. 목록에 없는 무드를 지어내지 마세요.
- moodReasons는 고른 무드마다 하나씩, **실제 신호를 인용**해서 작성하세요. (바넘식 두루뭉술 금지)

## 톤
- psychHook은 사람의 성향을 정확히 짚어 '나를 이렇게 봐주네' 싶게 하되, 평가·단정·부정 프레이밍은 금지. 촬영을 제안하는 따뜻한 톤.
- 모든 판단을 심리·지표의 구체적 근거에 묶으세요. 과장 금지.
- 반드시 한국어, 주어진 JSON 스키마로만 출력.`;

/** Stage2 생성 — 무드는 주어진 카탈로그 안에서만, 서버측에서 유효 id로 필터링 */
export async function generateShootPersona(
  client: Anthropic,
  model: string,
  persona: Persona,
  metricsText: string,
  moodCatalog: Array<{ id: string; title: string }>
): Promise<ShootPersona> {
  const purposeText = PURPOSE_OPTIONS.map((p) => `- ${p.key}: ${p.label} (${p.subtext})`).join("\n");
  const moodText = moodCatalog.map((m) => `- id=${m.id} · ${m.title}`).join("\n");

  const dataText = [
    formatPersona(persona),
    "",
    "## 인스타 정량 지표",
    metricsText,
    "",
    "## 선택 가능한 촬영 목적",
    purposeText,
    "",
    "## 선택 가능한 무드 카테고리 (이 목록 안에서만 moodIds 선택)",
    moodText || "(등록된 공개 무드 없음 — moodIds는 빈 배열로 두세요)",
  ].join("\n");

  const validIds = new Set(moodCatalog.map((m) => m.id));

  const call = () =>
    client.messages.parse({
      model,
      max_tokens: 2000,
      thinking: { type: "disabled" },
      system: SHOOT_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: dataText },
            {
              type: "text",
              text: "위 심리 프로파일과 지표를 근거로 촬영 페르소나를 만들고, 주어진 목록에서 목적·무드를 매핑하세요.",
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(ShootPersonaSchema) },
    });

  let res;
  try {
    res = await call();
  } catch (err) {
    console.warn("[shoot-persona] 파싱 실패, 1회 재시도:", err instanceof Error ? err.message : err);
    res = await call();
  }
  if (!res.parsed_output) throw new Error(`촬영 페르소나 파싱 실패 (stop_reason: ${res.stop_reason})`);

  const out = res.parsed_output;
  // 서버측 검증 — LLM이 목록 밖 무드를 냈으면 걸러내고, moodReasons도 유효 무드만 유지
  const keptIds = out.moodIds.filter((id) => validIds.has(id));
  const titleById = new Map(moodCatalog.map((m) => [m.id, m.title]));
  const keptTitles = new Set(keptIds.map((id) => titleById.get(id)));
  return {
    ...out,
    moodIds: keptIds,
    moodReasons: out.moodReasons.filter((r) => keptTitles.has(r.moodTitle)),
  };
}

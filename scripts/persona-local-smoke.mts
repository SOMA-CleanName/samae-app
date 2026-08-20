// 맥미니 로컬 VLM 타당성 확인 — 속도·JSON 스키마 준수·시각 묘사 품질을 잰다.
//
// 목적: Anthropic API 를 로컬 모델로 대체할 수 있는가?
// 판정 기준 3가지
//   1) 속도  — 사진 6장 + 구조화 출력이 실사용 가능한 시간에 끝나는가
//   2) 형식  — JSON 스키마를 지키는가 (안 지키면 파싱 폴백 지옥)
//   3) 품질  — signal 에 '사진을 봐야 쓸 수 있는' 시각 어휘가 들어가는가
//
// 실행: npx tsx --conditions=react-server --env-file=.env --env-file=.env.local \
//         scripts/persona-local-smoke.mts [모델] [사진수]

import sharp from "sharp";
import { createAdminClient } from "../src/lib/supabase/admin";

const MODEL = process.argv[2] ?? "qwen3-vl:30b-a3b-instruct";
const N = Number(process.argv[3] ?? 6);
const OLLAMA = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

const SCHEMA = {
  type: "object",
  properties: {
    shootPersonaLabel: { type: "string" },
    psychHook: { type: "string" },
    colorPalette: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
    moodReasons: {
      type: "array",
      items: {
        type: "object",
        properties: {
          moodTitle: { type: "string" },
          signal: { type: "string" },
          why: { type: "string" },
        },
        required: ["moodTitle", "signal", "why"],
      },
    },
  },
  required: ["shootPersonaLabel", "psychHook", "colorPalette", "moodReasons"],
} as const;

const SYSTEM = `당신은 사진의 시각 특성을 읽어 촬영 무드를 정하는 촬영 디렉터입니다.
사진에서 색온도(따뜻/차가움), 밝기(하이키/로우키), 질감(필름 그레인/디지털 선명), 채도, 구도, 피사체를 직접 관찰하세요.
signal 에는 사진에서 실제로 본 것만 구체적으로 쓰세요. 추측·일반론 금지.
반드시 한국어로, 주어진 JSON 스키마로만 출력하세요.`;

async function main() {
  const admin = createAdminClient();
  const { data: photos } = await admin
    .from("photos")
    .select("id, src_url")
    .eq("visibility", "published")
    .not("src_url", "is", null)
    .limit(N);

  const urls = (photos ?? []).map((p) => p.src_url as string).filter(Boolean);
  if (urls.length === 0) throw new Error("사진을 못 가져왔습니다.");
  console.log(`📷 사진 ${urls.length}장 준비`);

  // 앱과 동일하게 512px 로 줄여서 넣는다 (조건을 맞춰야 비교가 성립)
  const t0 = performance.now();
  const images = await Promise.all(
    urls.map(async (u) => {
      const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
      const small = await sharp(buf, { failOn: "none" })
        .rotate()
        .resize(512, 512, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      return small.toString("base64");
    })
  );
  console.log(`🖼  전처리 ${((performance.now() - t0) / 1000).toFixed(1)}s`);

  const t1 = performance.now();
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      format: SCHEMA,
      options: { temperature: 0.7, num_ctx: 8192 },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `이 사람의 피드 사진 ${images.length}장입니다. 반복되는 시각 특성을 관찰해 촬영 페르소나를 만들고, 어울리는 무드를 2~3개 제안하세요. colorPalette 는 사진에서 실제로 뽑은 hex 색상입니다.`,
          images,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as {
    message: { content: string };
    eval_count?: number;
    prompt_eval_count?: number;
  };
  const secs = (performance.now() - t1) / 1000;

  console.log(`\n⏱  추론 ${secs.toFixed(1)}s  (입력 ${json.prompt_eval_count ?? "?"} tok / 출력 ${json.eval_count ?? "?"} tok)`);

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(json.message.content);
    console.log("✅ JSON 스키마 준수");
  } catch {
    console.log("❌ JSON 파싱 실패 — 원문 앞 300자:");
    console.log(json.message.content.slice(0, 300));
    return;
  }

  console.log(JSON.stringify(parsed, null, 2).slice(0, 1600));

  const VISUAL = /색온도|채도|계조|그레인|하이키|로우키|역광|자연광|톤|명암|대비|흑백|빛바[랜램]|무채색|따뜻|차가|그림자|여백/;
  const reasons = ((parsed?.moodReasons ?? []) as Array<{ signal: string }>);
  const visual = reasons.filter((r) => VISUAL.test(r.signal ?? "")).length;
  console.log(`\n👁  시각 어휘를 쓴 signal: ${visual}/${reasons.length}`);
}

main().catch((e) => {
  console.error("실패:", e.message);
  process.exit(1);
});

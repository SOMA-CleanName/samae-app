// 로컬 VLM 설정 스윕 — 모델 × 사진수 × 해상도 를 바꿔가며 지연·품질을 잰다.
//
// 왜 필요한가: 첫 측정에서 qwen3-vl:30b 가 6장/512px 에 48초가 걸렸다.
// 바이럴 트래픽에서 동시 요청이 들어오면 그대로는 못 쓴다.
// 어디에 시간이 가는지(입력 처리 vs 출력 생성) 갈라서 봐야 옳은 손잡이를 돌릴 수 있다.
//
// 실행: npx tsx --conditions=react-server --env-file=.env --env-file=.env.local \
//         scripts/persona-local-bench.mts

import sharp from "sharp";
import { createAdminClient } from "../src/lib/supabase/admin";

const OLLAMA = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

type Cfg = { model: string; images: number; px: number; maxTokens: number };

const CONFIGS: Cfg[] = [
  { model: "qwen3-vl:30b-a3b-instruct", images: 6, px: 512, maxTokens: 700 }, // 기준선
  { model: "qwen3-vl:30b-a3b-instruct", images: 6, px: 384, maxTokens: 700 },
  { model: "qwen3-vl:30b-a3b-instruct", images: 4, px: 384, maxTokens: 400 },
  { model: "qwen3-vl:4b-instruct", images: 6, px: 512, maxTokens: 700 },
  { model: "qwen3-vl:4b-instruct", images: 6, px: 384, maxTokens: 400 },
  { model: "qwen3-vl:4b-instruct", images: 4, px: 384, maxTokens: 400 },
];

// 팔레트는 스키마에서 뺐다 — 모델이 사진에서 뽑는 게 아니라 CSS 색이름을 지어낸다(#F0F8FF 등).
// 색은 sharp 로 직접 뽑는 게 정확하고 공짜다. 모델은 '말'만 만들게 한다.
const SCHEMA = {
  type: "object",
  properties: {
    shootPersonaLabel: { type: "string" },
    psychHook: { type: "string" },
    moodReasons: {
      type: "array",
      minItems: 2,
      maxItems: 3,
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
  required: ["shootPersonaLabel", "psychHook", "moodReasons"],
} as const;

const SYSTEM = `당신은 사진의 시각 특성을 읽어 촬영 무드를 정하는 촬영 디렉터입니다.
색온도·밝기·질감·채도·구도·피사체를 직접 관찰하세요.
signal 에는 사진에서 실제로 본 것만 한 문장으로 쓰세요. 길게 늘이지 마세요.
psychHook 은 두 문장 이내. 반드시 한국어, 주어진 JSON 스키마로만 출력.`;

const VISUAL =
  /색온도|채도|계조|그레인|하이키|로우키|역광|자연광|톤|명암|대비|흑백|빛바[랜램]|무채색|따뜻|차가|그림자|여백/;

async function loadImages(urls: string[], px: number): Promise<string[]> {
  return Promise.all(
    urls.map(async (u) => {
      const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
      const out = await sharp(buf, { failOn: "none" })
        .rotate()
        .resize(px, px, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      return out.toString("base64");
    })
  );
}

async function run(cfg: Cfg, urls: string[]) {
  const images = await loadImages(urls.slice(0, cfg.images), cfg.px);
  const t = performance.now();
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: cfg.model,
      stream: false,
      format: SCHEMA,
      options: { temperature: 0.7, num_ctx: 8192, num_predict: cfg.maxTokens },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `피드 사진 ${images.length}장입니다. 반복되는 시각 특성을 관찰해 촬영 페르소나를 만들고 어울리는 무드를 2~3개 제안하세요.`,
          images,
        },
      ],
    }),
  });
  const secs = (performance.now() - t) / 1000;
  if (!res.ok) return { cfg, secs, ok: false, err: `${res.status}` };

  const j = (await res.json()) as {
    message: { content: string };
    eval_count?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_duration?: number;
  };
  let parsed: { moodReasons?: Array<{ signal: string }>; shootPersonaLabel?: string } | null = null;
  try {
    parsed = JSON.parse(j.message.content);
  } catch {
    return { cfg, secs, ok: false, err: "JSON 파싱 실패" };
  }
  const reasons = parsed?.moodReasons ?? [];
  return {
    cfg,
    secs,
    ok: true,
    inTok: j.prompt_eval_count ?? 0,
    outTok: j.eval_count ?? 0,
    // ollama 는 나노초로 준다 — 입력 처리와 출력 생성을 갈라 봐야 병목이 보인다
    inSec: (j.prompt_eval_duration ?? 0) / 1e9,
    outSec: (j.eval_duration ?? 0) / 1e9,
    visual: reasons.filter((r) => VISUAL.test(r.signal ?? "")).length,
    total: reasons.length,
    label: parsed?.shootPersonaLabel ?? "",
  };
}

async function main() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("photos")
    .select("src_url")
    .eq("visibility", "published")
    .not("src_url", "is", null)
    .limit(8);
  const urls = (data ?? []).map((p) => p.src_url as string).filter(Boolean);

  const rows: Awaited<ReturnType<typeof run>>[] = [];
  for (const cfg of CONFIGS) {
    process.stdout.write(`▶ ${cfg.model} · ${cfg.images}장 · ${cfg.px}px … `);
    const r = await run(cfg, urls);
    console.log(r.ok ? `${r.secs.toFixed(1)}s` : `실패(${(r as { err: string }).err})`);
    rows.push(r);
  }

  console.log(`\n${"─".repeat(88)}`);
  console.log(
    `${"모델".padEnd(26)} ${"장".padEnd(3)} ${"px".padEnd(4)} ${"총".padEnd(7)} ${"입력처리".padEnd(9)} ${"출력생성".padEnd(9)} ${"출력tok".padEnd(8)} 시각근거`
  );
  for (const r of rows) {
    if (!r.ok) {
      console.log(`${r.cfg.model.padEnd(26)} ${String(r.cfg.images).padEnd(3)} ${String(r.cfg.px).padEnd(4)} 실패`);
      continue;
    }
    console.log(
      `${r.cfg.model.padEnd(26)} ${String(r.cfg.images).padEnd(3)} ${String(r.cfg.px).padEnd(4)} ` +
        `${(r.secs.toFixed(1) + "s").padEnd(7)} ${((r.inSec ?? 0).toFixed(1) + "s").padEnd(9)} ${((r.outSec ?? 0).toFixed(1) + "s").padEnd(9)} ` +
        `${String(r.outTok).padEnd(8)} ${r.visual}/${r.total}`
    );
  }
  console.log(`\n라벨 샘플:`);
  for (const r of rows) if (r.ok) console.log(`  ${r.cfg.model} ${r.cfg.images}장/${r.cfg.px}px → ${r.label}`);
}

main().catch((e) => {
  console.error("실패:", e.message);
  process.exit(1);
});

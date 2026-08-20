// 완전 로컬 분석 경로 — Claude 없이 SigLIP(판단) + 맥미니 qwen3 4b(작문).
//
// 역할 분리(2026-08-20 측정으로 확정):
//   · 무드 선택: SigLIP 중심벡터 — leave-out 1위 적중 5/5 (LLM 보다 날카로움)
//   · 근거 사진: 무드 중심에 가장 가까운 사용자 사진 — 수학적으로 정직
//   · 목적(purposeKey): 목적 카테고리 중심벡터와의 코사인
//   · 문장: 텍스트 전용 4b — 팩트를 주입받아 작문만 (~3~6초, 비전 입력이 없어 빠름)
// 비용: Apify 스크래핑($0.0026)만 남는다. PERSONA_LLM=local 로 켠다.
import "server-only";
import { computeMetrics, formatMetrics } from "@/lib/persona/metrics";
import { getMoodCentroids, getPurposeCentroids, classifyMoods, cosine } from "@/lib/persona/centroids";
import type { IgProfile } from "@/lib/persona/types";
import type { Persona } from "@/lib/persona/schema";
import type { ShootPersona } from "@/lib/persona/shoot-schema";

type CopyOut = {
  shootPersonaLabel: string;
  oneLiner: string;
  psychHook: string;
  bigFive: Record<"openness" | "conscientiousness" | "extraversion" | "agreeableness" | "emotionalStability", number>;
  attachmentLabel: string;
  attachmentReason: string;
  moodReasons: Array<{ moodTitle: string; signal: string; why: string }>;
  evidence: string[];
  locations: string[];
};

async function generateCopy(facts: Record<string, unknown>): Promise<CopyOut> {
  const base = process.env.PERSONA_EMBED_URL?.trim().replace(/\/$/, "");
  if (!base) throw new Error("PERSONA_EMBED_URL 미설정 — 로컬 작문 불가");
  const res = await fetch(`${base}/persona_copy`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.PERSONA_SERVICE_TOKEN
        ? { "x-samae-token": process.env.PERSONA_SERVICE_TOKEN }
        : {}),
    },
    body: JSON.stringify(facts),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`persona_copy ${res.status}`);
  const j = (await res.json()) as { copy: CopyOut };
  return j.copy;
}

const clamp = (n: unknown, lo: number, hi: number, dflt: number): number => {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : dflt;
  return Math.min(hi, Math.max(lo, v));
};

/** 4b 작문 잔글자 청소 — 한자("사진 便 1·2")·번호 앞 기호("사진 -6")가 드물게 섞인다 (실측). */
const tidy = (s: string | undefined | null): string =>
  (s ?? "")
    .replace(/[㐀-䶿一-鿿]/g, "")
    .replace(/(\s)-(\d)/g, "$1$2")
    .replace(/\s{2,}/g, " ")
    .trim();

/** 벡터 + 프로필 → 기존과 동일한 (persona, shoot) 형태.
 *  판단은 전부 여기서(코드) 끝내고, 작문 모델에는 결정된 팩트만 준다. */
/** 팔레트 hex → 작문에 줄 '실측 톤 팩트'.
 *  작문 모델은 사진을 못 본다 — 내용을 지어내지 못하게, 말할 수 있는 사실을 준다. */
function toneFacts(palette: string[]): string {
  if (palette.length === 0) return "톤 정보 없음";
  let warm = 0;
  let light = 0;
  for (const hex of palette) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (r > b + 12) warm++;
    light += (r + g + b) / 3 / 255;
  }
  const lightAvg = light / palette.length;
  const temp = warm >= palette.length * 0.6 ? "따뜻한" : warm <= palette.length * 0.2 ? "차분한(중성·차가움)" : "중성적인";
  const bright = lightAvg > 0.62 ? "밝고 화사한(하이키)" : lightAvg < 0.38 ? "어둡고 깊은(로우키)" : "중간 밝기의";
  return `대표 색감은 ${temp} 계열, 전체적으로 ${bright} 톤`;
}

export async function analyzeLocally(
  profile: IgProfile | null,
  userVecs: number[][],
  palette: string[] = []
): Promise<{ persona: Persona; shoot: ShootPersona }> {
  if (userVecs.length === 0) throw new Error("임베딩 없음 — 로컬 경로 불가");

  const [moodCentroids, purposeCentroids] = await Promise.all([
    getMoodCentroids(),
    getPurposeCentroids(),
  ]);
  if (moodCentroids.length < 2) throw new Error("무드 중심벡터 부족");

  // ── 판단 (전부 코드) ──
  const moods = classifyMoods(userVecs, moodCentroids, 2);
  const userMean = (() => {
    const d = userVecs[0].length;
    const m = new Array<number>(d).fill(0);
    for (const v of userVecs) for (let i = 0; i < d; i++) m[i] += v[i];
    const n = Math.hypot(...m) || 1;
    return m.map((x) => x / n);
  })();
  const purpose =
    [...purposeCentroids].sort((a, b) => cosine(userMean, b.centroid) - cosine(userMean, a.centroid))[0]
      ?.key ?? "personal";

  const metricsText = profile ? formatMetrics(computeMetrics(profile)) : "(업로드 사진 기반 — 지표 없음)";

  // ── 작문 (팩트 주입) ──
  const facts = {
    설명: "아래 팩트만 근거로 결과 문장을 작성",
    선택된_무드: moods.map((m) => ({
      무드: m.title,
      유사도: Number(m.sim.toFixed(3)),
      근거사진_번호: m.photoIndexes,
    })),
    촬영목적: purpose,
    실측_톤: toneFacts(palette),
    인스타_지표: metricsText,
    계정소개: profile?.bio ?? "",
  };
  const copy = await generateCopy(facts);

  // ── 기존 타입으로 조립 (작문 출력은 신뢰하지 않고 전부 클램프·검증) ──
  const validTitles = new Set(moods.map((m) => m.title));
  const reasonByTitle = new Map(copy.moodReasons?.map((r) => [r.moodTitle, r]) ?? []);

  const persona: Persona = {
    oneLiner: tidy(copy.oneLiner) || "자기만의 결이 또렷한 사람",
    bigFive: {
      openness: { score: clamp(copy.bigFive?.openness, 0, 100, 55), note: "" },
      conscientiousness: { score: clamp(copy.bigFive?.conscientiousness, 0, 100, 55), note: "" },
      extraversion: { score: clamp(copy.bigFive?.extraversion, 0, 100, 50), note: "" },
      agreeableness: { score: clamp(copy.bigFive?.agreeableness, 0, 100, 55), note: "" },
      emotionalStability: { score: clamp(copy.bigFive?.emotionalStability, 0, 100, 52), note: "" },
    },
    attachment: {
      style: "secure",
      label: tidy(copy.attachmentLabel) || "안정 애착",
      reason: tidy(copy.attachmentReason) || "표현이 고르고 안정적이에요",
    },
    loveStyle: "",
    values: [],
    lifestyle: "",
    socialTendency: "",
    evidence: (copy.evidence ?? []).map(tidy).filter(Boolean).slice(0, 4),
  };

  const shoot: ShootPersona = {
    shootPersonaLabel: tidy(copy.shootPersonaLabel) || "나만의 무드를 아는 사람",
    purposeKey: (["wedding", "couple", "personal"] as const).includes(
      purpose as "wedding" | "couple" | "personal"
    )
      ? (purpose as "wedding" | "couple" | "personal")
      : "personal",
    moodIds: moods.map((m) => m.id),
    moodReasons: moods.map((m) => {
      const r = reasonByTitle.get(m.title);
      return {
        moodTitle: m.title,
        signal:
          (validTitles.has(m.title) && tidy(r?.signal)) ||
          `피드 사진 ${m.photoIndexes.join("·")}번이 이 무드와 가장 가깝게 읽혀요`,
        why: tidy(r?.why) || "당신이 이미 고르고 있는 룩이라 자연스럽게 어울려요",
        photoIndexes: m.photoIndexes,
      };
    }),
    colorPalette: [], // 서버가 픽셀에서 추출해 덮어쓴다 (기존과 동일)
    shootTypes: [],
    locations: (copy.locations ?? []).map(tidy).filter(Boolean).slice(0, 3),
    psychHook: tidy(copy.psychHook) || "당신의 피드에는 이미 당신다운 톤이 흐르고 있어요.",
  };

  return { persona, shoot };
}

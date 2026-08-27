// 오케스트레이터 — username → 스크래핑 → 판단·작문 → 결과.
// 결과 화면·쿠키 세팅·추천 사진은 서버액션/페이지에서 이 결과를 소비한다.
//
// 백엔드 스위치 (PERSONA_LLM):
//   claude(기본) — haiku 비전 병합 호출. 건당 ~$0.01, 판단+작문 동시 (combined.ts)
//   local        — SigLIP 중심벡터 판단 + 맥미니 4b 작문. 건당 $0 (local-pipeline.ts)
//                  임베딩 서비스 필수 — 실패하면 자동으로 claude 폴백.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { scrapeProfile } from "@/lib/persona/scrape";
import { computeMetrics, formatMetrics } from "@/lib/persona/metrics";
import { generateCombinedPersona } from "@/lib/persona/combined";
import { analyzeLocally } from "@/lib/persona/local-pipeline";
import { buildProfileText } from "@/lib/persona/psychology";
import { listPublishedMoods } from "@/lib/explore-db";
import { fetchImageBlocks, blockBuffers, blockThumbnails, type PersonaImageBlock } from "@/lib/persona/images";
import { extractPalette } from "@/lib/persona/palette";
import { embedImages, type EmbedResult } from "@/lib/persona/embed";
import { findSimilarPhotos, type SimilarPhoto } from "@/lib/persona/similar";
import type { IgProfile } from "@/lib/persona/types";
import type { Persona } from "@/lib/persona/schema";
import type { ShootPersona } from "@/lib/persona/shoot-schema";

export type PersonaScrapeReason = "private" | "empty";

// 비공개/게시물 없음 → 업로드 fallback 으로 유도하기 위한 타입 에러.
export class PersonaScrapeError extends Error {
  constructor(public reason: PersonaScrapeReason) {
    super(`persona scrape unavailable: ${reason}`);
    this.name = "PersonaScrapeError";
  }
}

// 표본 사진 수. 피드 전체에서 등간격으로 뽑고 512px 로 줄인다 (images.ts 주석).
const SAMPLE_IMAGES = 9;

// claude 모델 선택 근거 (2026-08-20 실측 · scripts/persona-model-sweep.sh)
//   opus-4-8 33.5s · sonnet-5 21.2s · haiku-4.5 16.3s — 시각근거는 셋 다 100%
// 스키마에 개수 하한(min 2)·signal 서술 요건을 박아야 haiku 가 100% 를 유지한다.
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export type PersonaAnalysis = {
  profile: IgProfile;
  persona: Persona;
  shoot: ShootPersona;
  /** 사용자 사진과 시각적으로 닮은 사매 사진. 임베딩 없으면 빈 배열 → 무드 큐레이션 폴백. */
  similar: SimilarPhoto[];
  /** 분석 표본 평균 벡터 — persona_results 저장 → 홈 피드 재정렬(0081). */
  meanVec: number[] | null;
  /** 표본 썸네일(data URL, photoIndexes 1-base 대응). DB 저장 안 함. */
  sampleThumbs: string[];
};

async function embedSafe(imgs: PersonaImageBlock[]): Promise<EmbedResult | null> {
  try {
    return await embedImages(imgs.map((b) => b.source.data));
  } catch (e) {
    console.warn("[persona] 임베딩 실패:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function similarSafe(vectors: number[][]): Promise<SimilarPhoto[]> {
  try {
    return await findSimilarPhotos(vectors, 9);
  } catch (e) {
    console.warn("[persona] 유사 사진 탐색 실패:", e instanceof Error ? e.message : e);
    return [];
  }
}

async function extractPaletteSafe(imgs: PersonaImageBlock[]): Promise<string[]> {
  try {
    return await extractPalette(blockBuffers(imgs), 5);
  } catch {
    return [];
  }
}

/** 판단·작문 공통 진입 — 백엔드 스위치와 폴백을 한 곳에서.
 *  profile 이 null 이면 업로드 경로(지표 없음). */
async function runBackend(
  profile: IgProfile | null,
  imgs: PersonaImageBlock[],
  moods: Array<{ id: string; title: string }>,
  embedded: EmbedResult | null,
  palette: string[] = []
): Promise<{ persona: Persona; shoot: ShootPersona; backend: string }> {
  if (process.env.PERSONA_LLM === "local" && embedded) {
    try {
      const r = await analyzeLocally(profile, embedded.vectors, palette);
      return { ...r, backend: "local" };
    } catch (e) {
      console.warn("[persona] 로컬 경로 실패 → claude 폴백:", e instanceof Error ? e.message : e);
    }
  }

  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const dataText = profile
    ? buildProfileText(profile, formatMetrics(computeMetrics(profile)))
    : `# 직접 업로드한 사진 ${imgs.length}장으로 분석\n(인스타 캡션·게시 지표 없음 — 이미지의 톤·색·구도·피사체만으로 신중하게 추론하고, 단서가 약한 항목은 중앙값 근처로 두세요.)`;
  // 팔레트를 프롬프트에 준다 — paletteReason 이 화면에 실제 표시될 색의 출처를 말하게 (정합)
  const r = await generateCombinedPersona(client, model, dataText, imgs, moods, palette);
  return { ...r, backend: "claude" };
}

async function analyzeCore(
  profile: IgProfile | null,
  imgs: PersonaImageBlock[]
): Promise<Omit<PersonaAnalysis, "profile">> {
  const t0 = Date.now();
  const moodsP = listPublishedMoods();
  // 임베딩·팔레트·썸네일은 판단·작문과 독립 — 나란히 돌린다
  const embeddedP = embedSafe(imgs);
  const paletteP = extractPaletteSafe(imgs);
  const thumbsP = blockThumbnails(imgs);

  // local 은 임베딩이 판단 재료라 먼저 필요하고, claude 는 기다릴 필요가 없다.
  const isLocal = process.env.PERSONA_LLM === "local";
  const embedded = isLocal ? await embeddedP : null;
  // 팔레트는 ~11ms — 두 경로 모두 기다린다. claude 는 paletteReason 이
  // 화면에 실제 표시될 색(픽셀 추출)의 출처를 말해야 하므로 프롬프트에 넣어야 한다.
  const earlyPalette = await paletteP;

  const { persona, shoot, backend } = await runBackend(
    profile,
    imgs,
    await moodsP,
    embedded,
    earlyPalette
  );
  const tGen = Date.now();

  const finalEmbedded = embedded ?? (await embeddedP);
  const [similar, palette, sampleThumbs] = await Promise.all([
    finalEmbedded ? similarSafe(finalEmbedded.vectors) : Promise.resolve([]),
    paletteP,
    thumbsP,
  ]);

  console.log(
    `[persona] 생성(${backend}) ${tGen - t0}ms · 마무리 ${Date.now() - tGen}ms`
  );

  return {
    persona,
    shoot: palette.length >= 3 ? { ...shoot, colorPalette: palette } : shoot,
    similar,
    meanVec: finalEmbedded?.mean ?? null,
    sampleThumbs,
  };
}

export async function analyzePersona(username: string): Promise<PersonaAnalysis> {
  const profile = await scrapeProfile(username);
  if (profile.isPrivate) throw new PersonaScrapeError("private");
  if (profile.posts.length === 0) throw new PersonaScrapeError("empty");

  const imgs = await fetchImageBlocks(profile, SAMPLE_IMAGES);
  return { profile, ...(await analyzeCore(profile, imgs)) };
}

// 업로드 fallback — 스크래핑 없이 직접 올린 사진만으로 분석.
export async function analyzePersonaFromImages(
  images: PersonaImageBlock[]
): Promise<Omit<PersonaAnalysis, "profile">> {
  return analyzeCore(null, images);
}

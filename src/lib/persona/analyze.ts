// 오케스트레이터 — username → 스크래핑 → Stage1(심리) → Stage2(촬영 페르소나).
// 결과 화면·쿠키 세팅·추천 사진은 서버액션/페이지(다음 청크)에서 이 결과를 소비한다.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { scrapeProfile } from "@/lib/persona/scrape";
import { computeMetrics, formatMetrics } from "@/lib/persona/metrics";
import { generateCombinedPersona } from "@/lib/persona/combined";
import { buildProfileText } from "@/lib/persona/psychology";
import { listPublishedMoods } from "@/lib/explore-db";
import { fetchImageBlocks, blockBuffers, blockThumbnails, type PersonaImageBlock } from "@/lib/persona/images";
import { extractPalette } from "@/lib/persona/palette";
import { embedImages } from "@/lib/persona/embed";
import { findSimilarPhotos, type SimilarPhoto } from "@/lib/persona/similar";
import type { IgProfile } from "@/lib/persona/types";
import type { Persona } from "@/lib/persona/schema";
import type { ShootPersona } from "@/lib/persona/shoot-schema";

export type PersonaScrapeReason = "private" | "empty";

// 비공개/게시물 없음 → 업로드 fallback(청크7)으로 유도하기 위한 타입 에러.
export class PersonaScrapeError extends Error {
  constructor(public reason: PersonaScrapeReason) {
    super(`persona scrape unavailable: ${reason}`);
    this.name = "PersonaScrapeError";
  }
}

// 두 단계가 공유할 사진 표본 수. 피드 전체에서 등간격으로 뽑고 512px 로 줄여서 넘긴다.
// (3장 → 9장으로 늘렸지만 축소 덕에 토큰은 오히려 비슷하다. images.ts 주석 참고)
const SAMPLE_IMAGES = 9;

// 모델 선택 근거 (2026-08-20, 동일 입력 2프로필 × 2회 실측 · scripts/persona-model-sweep.sh)
//   opus-4-8   33.5s · 시각근거 100% · 근거 3.0개
//   sonnet-5   21.2s · 100% · 2.25개
//   haiku-4.5  16.3s · 100% · 2.0개   ← 채택
// 스키마에 개수 하한(min 2)과 signal 서술 요건을 박고 나서야 haiku 가 100% 에 도달했다.
// 그 전에는 프로필에 따라 75% 까지 떨어졌다 — 값싼 모델일수록 문장 지시를 흘린다.
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export type PersonaAnalysis = {
  profile: IgProfile;
  persona: Persona;
  shoot: ShootPersona;
  /** 사용자 사진과 시각적으로 닮은 사매 사진. 임베딩 서비스가 없으면 빈 배열이고,
   *  그때는 호출부가 기존 무드 큐레이션으로 폴백한다. */
  similar: SimilarPhoto[];
  /** 분석에 쓴 표본 사진의 초소형 썸네일(data URL, photoIndexes 와 1-base 로 대응).
   *  결과 화면 '근거' 옆에 붙는다. DB 저장 안 함. */
  sampleThumbs: string[];
};

/** 사용자 사진 → 벡터 → '닮은 사매 사진'.
 *  실패하면 빈 배열 — 추천이 없어도 분석 결과는 보여줘야 한다. */
async function findSimilar(imgs: PersonaImageBlock[]): Promise<SimilarPhoto[]> {
  try {
    const embedded = await embedImages(imgs.map((b) => b.source.data));
    if (!embedded) return [];
    return await findSimilarPhotos(embedded.vectors, 9);
  } catch (e) {
    console.warn("[persona] 유사 사진 탐색 실패:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** 사진에서 실제 색을 뽑는다. 실패하면 빈 배열 — 팔레트 때문에 분석이 죽으면 안 된다. */
async function extractPaletteSafe(imgs: PersonaImageBlock[]): Promise<string[]> {
  try {
    return await extractPalette(blockBuffers(imgs), 5);
  } catch {
    return [];
  }
}

/** LLM 이 지어낸 colorPalette 를 실제 사진에서 뽑은 색으로 교체한다. */
async function withRealPalette(shoot: ShootPersona, imgs: PersonaImageBlock[]): Promise<ShootPersona> {
  const palette = await extractPaletteSafe(imgs);
  return palette.length >= 3 ? { ...shoot, colorPalette: palette } : shoot;
}

export async function analyzePersona(username: string): Promise<PersonaAnalysis> {
  const profile = await scrapeProfile(username);
  if (profile.isPrivate) throw new PersonaScrapeError("private");
  if (profile.posts.length === 0) throw new PersonaScrapeError("empty");

  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  // 사진은 한 번만 받아 두 단계가 나눠 쓴다 (같은 표본 = 두 단계의 판단이 어긋나지 않는다).
  // 무드 카탈로그는 사진 다운로드와 겹쳐 받는다.
  const t0 = Date.now();
  const [imgs, moods] = await Promise.all([
    fetchImageBlocks(profile, SAMPLE_IMAGES),
    listPublishedMoods(),
  ]);
  const tImgs = Date.now();

  // 임베딩·팔레트는 LLM 과 무관하다 — Stage1 이 도는 동안 같이 돌린다.
  // (직렬로 두면 그만큼 그대로 응답시간에 더해진다)
  const sideWork = Promise.all([findSimilar(imgs), extractPaletteSafe(imgs), blockThumbnails(imgs)]);

  // 심리 + 촬영 페르소나를 한 번의 비전 호출로 (combined.ts 주석 참고 — 사진 중복 업로드 제거)
  const { persona, shoot } = await generateCombinedPersona(
    client,
    model,
    buildProfileText(profile, formatMetrics(computeMetrics(profile))),
    imgs,
    moods
  );
  const tLlm = Date.now();

  const [similar, palette, sampleThumbs] = await sideWork;
  console.log(
    `[persona] 사진 ${tImgs - t0}ms · LLM ${tLlm - tImgs}ms · 부수작업 ${Date.now() - tLlm}ms(대기)`
  );

  return {
    profile,
    persona,
    shoot: palette.length >= 3 ? { ...shoot, colorPalette: palette } : shoot,
    similar,
    sampleThumbs,
  };
}

// 업로드 fallback — 스크래핑 없이 직접 올린 사진만으로 분석.
export async function analyzePersonaFromImages(
  images: PersonaImageBlock[]
): Promise<Omit<PersonaAnalysis, "profile">> {
  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const moods = await listPublishedMoods();
  // 업로드 경로는 캡션·지표가 없어 사진이 유일한 근거다.
  const { persona, shoot } = await generateCombinedPersona(
    client,
    model,
    `# 직접 업로드한 사진 ${images.length}장으로 분석\n(인스타 캡션·게시 지표 없음 — 이미지의 톤·색·구도·피사체만으로 신중하게 추론하고, 단서가 약한 항목은 중앙값 근처로 두세요.)`,
    images,
    moods
  );
  const [finalShoot, similar, sampleThumbs] = await Promise.all([
    withRealPalette(shoot, images),
    findSimilar(images),
    blockThumbnails(images),
  ]);
  return { persona, shoot: finalShoot, similar, sampleThumbs };
}

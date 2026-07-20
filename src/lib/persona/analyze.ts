// 오케스트레이터 — username → 스크래핑 → Stage1(심리) → Stage2(촬영 페르소나).
// 결과 화면·쿠키 세팅·추천 사진은 서버액션/페이지(다음 청크)에서 이 결과를 소비한다.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { scrapeProfile } from "@/lib/persona/scrape";
import { computeMetrics, formatMetrics } from "@/lib/persona/metrics";
import { generatePersona, generatePersonaFromImages } from "@/lib/persona/psychology";
import { generateShootPersona } from "@/lib/persona/shoot-persona";
import { listPublishedMoods } from "@/lib/explore-db";
import type { PersonaImageBlock } from "@/lib/persona/images";
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

export type PersonaAnalysis = {
  profile: IgProfile;
  persona: Persona;
  shoot: ShootPersona;
};

export async function analyzePersona(username: string): Promise<PersonaAnalysis> {
  const profile = await scrapeProfile(username);
  if (profile.isPrivate) throw new PersonaScrapeError("private");
  if (profile.posts.length === 0) throw new PersonaScrapeError("empty");

  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

  // Stage1 심리 프로파일
  const persona = await generatePersona(client, model, profile);

  // Stage2 촬영 페르소나·무드 매핑 (런타임 무드 카탈로그 주입)
  const [moods] = await Promise.all([listPublishedMoods()]);
  const metricsText = formatMetrics(computeMetrics(profile));
  const shoot = await generateShootPersona(client, model, persona, metricsText, moods);

  return { profile, persona, shoot };
}

// 업로드 fallback — 스크래핑 없이 직접 올린 사진만으로 분석.
export async function analyzePersonaFromImages(
  images: PersonaImageBlock[]
): Promise<Omit<PersonaAnalysis, "profile">> {
  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

  const persona = await generatePersonaFromImages(client, model, images);
  const moods = await listPublishedMoods();
  const shoot = await generateShootPersona(
    client,
    model,
    persona,
    "(직접 업로드한 사진 기반 — 인스타 정량 지표 없음)",
    moods
  );
  return { persona, shoot };
}

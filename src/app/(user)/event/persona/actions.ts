"use server";

import { cookies } from "next/headers";
import { TASTE_COOKIE, TASTE_V2_COOKIE, serializeTasteV2 } from "@/lib/category-constants";
import { purposeByKey } from "@/lib/taste-purposes";
import {
  resolveCategoryIdsBySlugs,
  fetchTasteCurated,
  fetchExploreCategoryGalleryPhotos,
} from "@/lib/explore-db";
import { analyzePersona, analyzePersonaFromImages, PersonaScrapeError } from "@/lib/persona/analyze";
import { imageBlockFromBase64 } from "@/lib/persona/images";
import type { Persona } from "@/lib/persona/schema";
import type { ShootPersona } from "@/lib/persona/shoot-schema";
import type { PersonaActionResult, PersonaSuccess, RecoPhoto } from "./view-types";

// 공통 마무리 — taste2 쿠키 세팅 + 어울리는 사진 조회 → 성공 결과 조립.
async function finalize(
  persona: Persona,
  shoot: ShootPersona,
  username: string,
  profilePicUrl: string | null
): Promise<PersonaSuccess> {
  const purpose = purposeByKey(shoot.purposeKey);
  const purposeIds = purpose ? await resolveCategoryIdsBySlugs(purpose.categorySlugs) : [];

  // taste v2 쿠키 세팅 → 이후 홈 피드가 자동 개인화 (취향 퀴즈와 동일 규칙)
  const store = await cookies();
  store.delete(TASTE_COOKIE);
  if (purposeIds.length > 0 || shoot.moodIds.length > 0) {
    store.set(TASTE_V2_COOKIE, serializeTasteV2(shoot.purposeKey, purposeIds, shoot.moodIds), {
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      sameSite: "lax",
    });
  }

  // 어울리는 사진 — 목적∩무드 큐레이션, 목적 태깅이 비면 무드 카테고리로 폴백
  let photos: RecoPhoto[] = await fetchTasteCurated(purposeIds, shoot.moodIds, 9);
  if (photos.length === 0 && shoot.moodIds.length > 0) {
    const perMood = await Promise.all(
      shoot.moodIds.map((id) => fetchExploreCategoryGalleryPhotos(id, 6))
    );
    const seen = new Set<string>();
    photos = perMood
      .flat()
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
      .slice(0, 9)
      .map((p) => ({ id: p.id, url: p.thumb_url ?? p.src_url }));
  }

  return { ok: true, username, profilePicUrl, persona, shoot, photos };
}

// username → 스크래핑 분석. (결과는 영속 저장 없음 — 개인정보 최소화)
export async function runPersonaAnalysis(usernameRaw: string): Promise<PersonaActionResult> {
  const username = usernameRaw.replace(/^@/, "").trim();
  if (!username) return { ok: false, reason: "error", message: "인스타 아이디를 입력해 주세요." };

  try {
    const { profile, persona, shoot } = await analyzePersona(username);
    return finalize(persona, shoot, profile.username, profile.profilePicUrl ?? null);
  } catch (e) {
    if (e instanceof PersonaScrapeError) {
      return {
        ok: false,
        reason: e.reason,
        message:
          e.reason === "private"
            ? "비공개 계정이라 피드를 읽을 수 없어요. 사진을 직접 올려서 분석해볼 수 있어요."
            : "게시물이 너무 적어 분석이 어려워요. 사진을 직접 올려볼까요?",
      };
    }
    console.error("[persona] 분석 실패:", e);
    return { ok: false, reason: "error", message: "분석에 실패했어요. 잠시 후 다시 시도해 주세요." };
  }
}

// 업로드 fallback — 클라이언트가 리사이즈한 base64 사진들로 분석. (비공개/게시물 없음 대비)
export async function analyzeFromImages(
  images: Array<{ mediaType: string; data: string }>
): Promise<PersonaActionResult> {
  const blocks = (images ?? [])
    .slice(0, 5)
    .map((i) => imageBlockFromBase64(i.mediaType, i.data))
    .filter((b): b is NonNullable<typeof b> => b !== null);
  if (blocks.length === 0) {
    return { ok: false, reason: "error", message: "분석할 사진을 올려 주세요. (jpg/png)" };
  }

  try {
    const { persona, shoot } = await analyzePersonaFromImages(blocks);
    return finalize(persona, shoot, "", null);
  } catch (e) {
    console.error("[persona] 업로드 분석 실패:", e);
    return { ok: false, reason: "error", message: "분석에 실패했어요. 다른 사진으로 다시 시도해 주세요." };
  }
}

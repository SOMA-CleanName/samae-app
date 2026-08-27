"use server";

import { cookies, headers } from "next/headers";
import { TASTE_COOKIE, TASTE_V2_COOKIE, serializeTasteV2 } from "@/lib/category-constants";
import { purposeByKey } from "@/lib/taste-purposes";
import {
  resolveCategoryIdsBySlugs,
  fetchTasteCurated,
  fetchExploreCategoryGalleryPhotos,
} from "@/lib/explore-db";
import { analyzePersona, analyzePersonaFromImages, PersonaScrapeError } from "@/lib/persona/analyze";
import { imageBlockFromBase64 } from "@/lib/persona/images";
import { findCached, saveResult, isRateLimited, PERSONA_RESULT_COOKIE } from "@/lib/persona/store";
import { fetchLikedPhotosByIds } from "@/lib/discovery";
import { lookupProfile, type LookupResult } from "@/lib/persona/lookup";
import type { Persona } from "@/lib/persona/schema";
import type { ShootPersona } from "@/lib/persona/shoot-schema";
import type { SimilarPhoto } from "@/lib/persona/similar";
import type { PersonaActionResult, PersonaSuccess, RecoPhoto } from "./view-types";

/** 아이디 입력 중 프로필 확인 카드용 사전 조회 — 분석 비용이 들지 않는다. */
export async function lookupInstagramProfile(username: string): Promise<LookupResult> {
  return lookupProfile(username);
}

/** 결과 행 id 쿠키 — 홈 피드가 저장된 벡터로 페이지를 재정렬한다 (0080). 벡터 자체는 안 나간다. */
async function setResultCookie(shareId: string | null): Promise<void> {
  if (!shareId) return;
  (await cookies()).set(PERSONA_RESULT_COOKIE, shareId, {
    maxAge: 60 * 60 * 72, // 결과 TTL 과 동일 — 만료된 벡터를 가리키지 않게
    path: "/",
    sameSite: "lax",
    httpOnly: true,
  });
}

/** 클라이언트 IP — Vercel 은 x-forwarded-for 첫 항목이 실제 클라이언트다. */
async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]!.trim() || null;
    return h.get("x-real-ip");
  } catch {
    return null;
  }
}

// 공통 마무리 — taste2 쿠키 세팅 + 어울리는 사진 조회 → 성공 결과 조립.
async function finalize(
  persona: Persona,
  shoot: ShootPersona,
  username: string,
  profilePicUrl: string | null,
  shareId: string | null = null,
  /** 임베딩으로 찾은 '내 사진과 닮은 사진'. 있으면 이걸 쓰고, 없으면 무드 큐레이션으로 폴백. */
  similar: SimilarPhoto[] = [],
  /** 분석 표본 썸네일 — 결과의 '근거' 옆에 붙는다 */
  sampleThumbs: string[] = []
): Promise<PersonaSuccess> {
  const purpose = purposeByKey(shoot.purposeKey);
  const purposeIds = purpose ? await resolveCategoryIdsBySlugs(purpose.categorySlugs) : [];

  // taste v2 쿠키 세팅 → 이후 홈 피드가 자동 개인화 (취향 퀴즈와 동일 규칙)
  const store = await cookies();
  store.delete(TASTE_COOKIE);
  // 결과 행 id 쿠키(재정렬용)는 캐시 히트처럼 shareId 를 이미 아는 경우 여기서,
  // 신선 분석은 저장 직후 setResultCookie 가 심는다.
  if (shareId) await setResultCookie(shareId);
  if (purposeIds.length > 0 || shoot.moodIds.length > 0) {
    store.set(TASTE_V2_COOKIE, serializeTasteV2(shoot.purposeKey, purposeIds, shoot.moodIds), {
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      sameSite: "lax",
    });
  }

  // 어울리는 사진.
  // 1순위는 임베딩 추천 — 사용자 사진과 시각적으로 닮은 사진이라 '내 취향'이 훨씬 잘 드러난다.
  // 임베딩 서비스가 꺼져 있거나(로컬 전용) 실패하면 기존 무드 큐레이션으로 내려간다.
  if (similar.length > 0) {
    return {
      ok: true,
      username,
      profilePicUrl,
      persona,
      shoot,
      // "왜 이 사진인가" 근거는 **실제 파이프라인 값만** 싣는다 (지어내지 않는다).
      // 캐시 복원(distance 0 더미)은 해당 필드가 조용히 빠지고 UI 도 생략한다.
      photos: similar.map((p) => ({
        id: p.id,
        url: p.thumb_url ?? p.src_url,
        ...(p.distance > 0 && p.distance < 1 ? { similarity: 1 - p.distance } : {}),
        ...(p.seedIdx !== undefined ? { seedIdx: p.seedIdx } : {}),
      })),
      shareId,
      sampleThumbs,
    };
  }

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

  return { ok: true, username, profilePicUrl, persona, shoot, photos, shareId, sampleThumbs };
}

// username → 스크래핑 분석.
// 저장하는 것은 LLM 산출물과 사진 id 뿐 — 아이디·IP 는 해시, 원본 게시물은 저장하지 않는다.
export async function runPersonaAnalysis(usernameRaw: string): Promise<PersonaActionResult> {
  const username = usernameRaw.replace(/^@/, "").trim();
  if (!username) return { ok: false, reason: "error", message: "인스타 아이디를 입력해 주세요." };

  // 1) 캐시 — 같은 아이디의 최근 결과가 있으면 스크래핑·LLM 을 태우지 않는다.
  const cached = await findCached(username);
  if (cached) {
    // 저장해 둔 사진 id 로 **같은 결과**를 복원한다.
    // 여기서 무드 큐레이션을 다시 돌리면, 임베딩으로 뽑았던 추천이 캐시 히트 순간
    // 조용히 다른 사진으로 바뀐다 — 같은 링크가 매번 다른 결과를 보여주게 된다.
    const rows = await fetchLikedPhotosByIds(cached.photoIds);
    const restored: SimilarPhoto[] = rows.map((p) => ({
      id: p.id,
      src_url: p.src_url,
      thumb_url: p.thumb_url ?? null,
      mood_tags: null,
      album_id: null,
      photographer_id: null,
      distance: 0, // 더미 — 실측 유사도가 아니므로 finalize 가 similarity 를 싣지 않는다
    }));
    return finalize(cached.persona, cached.shoot, username, null, cached.id, restored);
  }

  // 2) 레이트리밋 — 캐시 미스일 때만 센다(재조회는 비용이 0이므로 막을 이유가 없다).
  const ip = await clientIp();
  if (await isRateLimited(ip)) {
    return {
      ok: false,
      reason: "rate_limited",
      message: "잠시 후 다시 시도해 주세요. (짧은 시간에 너무 많이 분석했어요)",
    };
  }

  try {
    const { profile, persona, shoot, similar, meanVec, sampleThumbs } = await analyzePersona(username);
    const result = await finalize(
      persona,
      shoot,
      profile.username,
      profile.profilePicUrl ?? null,
      null,
      similar,
      sampleThumbs
    );
    // 저장은 마무리 뒤 — 폴백(무드 큐레이션)이어도 실제 보여준 사진 id 가 저장된다
    const shareId = await saveResult({
      username,
      method: "instagram",
      persona,
      shoot,
      photoIds: result.photos.map((p) => p.id),
      ip,
      embedding: meanVec,
    });
    await setResultCookie(shareId);
    return { ...result, shareId };
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

  const ip = await clientIp();
  if (await isRateLimited(ip)) {
    return {
      ok: false,
      reason: "rate_limited",
      message: "잠시 후 다시 시도해 주세요. (짧은 시간에 너무 많이 분석했어요)",
    };
  }

  try {
    const { persona, shoot, similar, meanVec, sampleThumbs } = await analyzePersonaFromImages(blocks);
    const result = await finalize(persona, shoot, "", null, null, similar, sampleThumbs);
    // 업로드 경로는 캐시 키(아이디)가 없다 — 공유·재정렬용으로만 저장한다.
    const shareId = await saveResult({
      username: null,
      method: "upload",
      persona,
      shoot,
      photoIds: result.photos.map((p) => p.id),
      ip,
      embedding: meanVec,
    });
    await setResultCookie(shareId);
    return { ...result, shareId };
  } catch (e) {
    console.error("[persona] 업로드 분석 실패:", e);
    return { ok: false, reason: "error", message: "분석에 실패했어요. 다른 사진으로 다시 시도해 주세요." };
  }
}

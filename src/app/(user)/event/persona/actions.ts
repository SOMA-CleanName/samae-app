"use server";

import { cookies } from "next/headers";
import { TASTE_COOKIE, TASTE_V2_COOKIE, serializeTasteV2 } from "@/lib/category-constants";
import { purposeByKey } from "@/lib/taste-purposes";
import {
  resolveCategoryIdsBySlugs,
  fetchTasteCurated,
  fetchExploreCategoryGalleryPhotos,
} from "@/lib/explore-db";
import { analyzePersona, PersonaScrapeError } from "@/lib/persona/analyze";
import type { PersonaActionResult } from "./view-types";

// username → 분석 → taste2 쿠키 세팅 + 추천 사진 → 결과.
// (결과 화면은 이 반환값을 그대로 렌더. 영속 저장 없음 — 개인정보 최소화)
export async function runPersonaAnalysis(usernameRaw: string): Promise<PersonaActionResult> {
  const username = usernameRaw.replace(/^@/, "").trim();
  if (!username) return { ok: false, reason: "error", message: "인스타 아이디를 입력해 주세요." };

  try {
    const { profile, persona, shoot } = await analyzePersona(username);

    // 목적 슬러그 → 카테고리 id (기존 취향 로직 재사용)
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

    // 어울리는 사진 (목적∩무드 큐레이션). 목적 카탈로그 태깅이 비어있으면
    // 무드 카테고리 사진으로 폴백 (무드는 사진이 풍부함 — 결과 화면이 비지 않게)
    let photos = await fetchTasteCurated(purposeIds, shoot.moodIds, 9);
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

    return {
      ok: true,
      username: profile.username,
      profilePicUrl: profile.profilePicUrl ?? null,
      persona,
      shoot,
      photos,
    };
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

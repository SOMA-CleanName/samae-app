import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeQuery } from "@/lib/discovery";
import { mpTrackServer } from "@/lib/mixpanel-server";
import { EMPTY_INTERPRETATION, type SearchInterpretation } from "@/lib/search-interpretation";

// 메인 검색어를 적재한다 — 인기 검색어 랭킹·검색 실패어 분석용.
// fire-and-forget 으로 호출(렌더를 막지 않음). RLS 우회가 필요하므로 service_role 사용.
//
// interpretation — 검색어를 목적 · 무드로 어떻게 나눴고 어느 무드 가족으로 갔나(lib/search-interpretation).
// 어드민 「도구 → 검색」 이 검색어마다 연결된 무드를 보여준다.
export async function logSearch(
  raw: string,
  resultCount: number,
  profileId?: string | null,
  interpretation: SearchInterpretation = EMPTY_INTERPRETATION
): Promise<void> {
  const trimmed = raw.trim().slice(0, 80);
  const compact = normalizeQuery(trimmed);
  if (!compact) return; // 정규화 후 빈 검색어(특수문자만 등)는 버린다

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("search_logs").insert({
      raw: trimmed,
      compact,
      result_count: resultCount,
      profile_id: profileId ?? null,
      purposes: interpretation.purposes,
      mood_text: interpretation.moodText,
      mood_mode: interpretation.moodMode,
      mood_families: interpretation.moodFamilies,
      mood_filled: interpretation.moodFilled,
    });
    // 테이블이 없던 동안(0049 미적용) 404 를 아무도 몰랐다 — 조용히 삼키지 않고 서버 로그엔 남긴다
    if (error) console.error("[search-log] 검색 기록 실패:", error.message);

    // Mixpanel Search — result_count·zero_result(검색 실패어 = 공급 공백 신호).
    // 로그인 유저만(profileId). 익명 검색은 search_logs 테이블에만 남는다.
    await mpTrackServer("Search", profileId, {
      query: compact,
      result_count: resultCount,
      zero_result: resultCount === 0,
    });
  } catch {
    /* 로깅 실패가 검색 응답을 막지 않게 무시 */
  }
}

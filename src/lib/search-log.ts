import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeQuery } from "@/lib/discovery";
import { mpTrackServer } from "@/lib/mixpanel-server";

// 메인 검색어를 적재한다 — 인기 검색어 랭킹·검색 실패어 분석용.
// fire-and-forget 으로 호출(렌더를 막지 않음). RLS 우회가 필요하므로 service_role 사용.
export async function logSearch(raw: string, resultCount: number, profileId?: string | null): Promise<void> {
  const trimmed = raw.trim().slice(0, 80);
  const compact = normalizeQuery(trimmed);
  if (!compact) return; // 정규화 후 빈 검색어(특수문자만 등)는 버린다

  try {
    const admin = createAdminClient();
    await admin.from("search_logs").insert({
      raw: trimmed,
      compact,
      result_count: resultCount,
      profile_id: profileId ?? null,
    });

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

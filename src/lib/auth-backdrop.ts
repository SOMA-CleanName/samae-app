import "server-only";

import { createPublicClient } from "@/lib/supabase/public";
import { pickWindow, shuffle } from "@/lib/random-pick";

/**
 * 로그인·가입 지면 뒤에 깔 사진.
 *
 * 이 화면들엔 사진이 한 장도 없었다. 사진작가를 만나러 오는 서비스인데
 * 첫 화면이 어느 SaaS 로그인이든 될 수 있는 흰 폼이었다.
 *
 * 쿠키를 읽지 않는 anon 클라이언트를 쓴다. server.ts 의 createClient 는 cookies() 를
 * 불러서 이 지면을 통째로 동적 렌더로 만드는데, 로그인 화면은 자주 열리니 매번 DB 를
 * 칠 이유가 없다(page 의 revalidate).
 *
 * ⚠️ 처음엔 같은 이유로 admin(service_role)을 썼는데 그게 **Preview 배포를 죽였다** —
 *    Vercel Preview 스코프엔 SUPABASE_SERVICE_ROLE_KEY 가 없고, /login 은 빌드 타임에
 *    프리렌더되므로 "supabaseKey is required" 로 빌드가 통째로 실패했다.
 *    anon 으로 바꾸면 정적 렌더도 유지되고 Preview 도 산다.
 *    (공개 사진 조회라 anon 으로 충분하다 — RLS 가 published·approved 만 내준다.
 *     아래 필터는 그 위에 한 겹 더 거는 것이지 이제 유일한 방어선이 아니다.)
 *
 * 🔴 **2026-09-21 — 늘 같은 사진이 떴다.** `order(created_at desc).limit(18)` 이라
 *    **최신 18장 고정**이었고, 지면이 하루 캐시돼서 더 굳어 보였다. 공개 사진이 1,601장인데
 *    그중 18장만 보이면 "사진이 많다" 는 인상을 줄 수가 없다. 이제 전체에서 무작위
 *    구간을 떼어 섞는다(lib/random-pick). 캐시 주기도 24시간 → 10분으로 줄였다.
 */

/** 공개 조건 — RLS 위에 한 겹 더. 내린 사진(feed_hidden)과 미승인 작가는 뺀다 */
const PUBLISHED = {
  visibility: "published",
  feed_hidden: false,
  "photographer.status": "approved",
} as const;

const SELECT =
  "thumb_url, src_url, photographer:photographers!photos_photographer_id_fkey!inner(id, status)";

export async function fetchAuthBackdropPhotos(limit = 18): Promise<string[]> {
  const supabase = createPublicClient();

  // 몇 장이나 있는지 먼저 센다 — 전체에서 고르려면 범위를 알아야 한다.
  // head:true 라 행은 안 받고 개수만 가져온다.
  const { count } = await supabase
    .from("photos")
    .select(SELECT, { count: "exact", head: true })
    .match(PUBLISHED);

  const { start, size } = pickWindow(count ?? 0, limit);
  if (size === 0) return [];

  const { data, error } = await supabase
    .from("photos")
    .select(SELECT)
    .match(PUBLISHED)
    // 정렬이 없으면 DB 가 돌려주는 순서가 보장되지 않아 range 가 매번 다른 것을 가리킨다.
    // 기준만 고정해 두고, 무작위성은 start 와 아래 셔플이 만든다.
    .order("created_at", { ascending: false })
    .range(start, start + size - 1);

  if (error) return [];

  const urls = ((data ?? []) as unknown as Array<{ thumb_url: string | null; src_url: string }>)
    .map((p) => p.thumb_url ?? p.src_url)
    .filter(Boolean);

  return shuffle(urls).slice(0, limit);
}

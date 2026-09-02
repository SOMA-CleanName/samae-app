import "server-only";

import { createPublicClient } from "@/lib/supabase/public";

/**
 * 로그인·가입 지면 뒤에 깔 사진.
 *
 * 이 화면들엔 사진이 한 장도 없었다. 사진작가를 만나러 오는 서비스인데
 * 첫 화면이 어느 SaaS 로그인이든 될 수 있는 흰 폼이었다.
 *
 * 쿠키를 읽지 않는 anon 클라이언트를 쓴다. server.ts 의 createClient 는 cookies() 를
 * 불러서 이 지면을 통째로 동적 렌더로 만드는데, 로그인 화면은 자주 열리니 매번 DB 를
 * 칠 이유가 없다(page 의 revalidate=86400).
 *
 * ⚠️ 처음엔 같은 이유로 admin(service_role)을 썼는데 그게 **Preview 배포를 죽였다** —
 *    Vercel Preview 스코프엔 SUPABASE_SERVICE_ROLE_KEY 가 없고, /login 은 빌드 타임에
 *    프리렌더되므로 "supabaseKey is required" 로 빌드가 통째로 실패했다.
 *    anon 으로 바꾸면 정적 렌더도 유지되고 Preview 도 산다.
 *    (공개 사진 조회라 anon 으로 충분하다 — RLS 가 published·approved 만 내준다.
 *     아래 필터는 그 위에 한 겹 더 거는 것이지 이제 유일한 방어선이 아니다.)
 */
export async function fetchAuthBackdropPhotos(limit = 18): Promise<string[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("photos")
    .select(
      "thumb_url, src_url, photographer:photographers!photos_photographer_id_fkey!inner(id, status)"
    )
    .eq("visibility", "published")
    .eq("feed_hidden", false)
    .eq("photographer.status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return ((data ?? []) as unknown as Array<{ thumb_url: string | null; src_url: string }>)
    .map((p) => p.thumb_url ?? p.src_url)
    .filter(Boolean);
}

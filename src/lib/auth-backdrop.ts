import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 로그인·가입 지면 뒤에 깔 사진.
 *
 * 이 화면들엔 사진이 한 장도 없었다. 사진작가를 만나러 오는 서비스인데
 * 첫 화면이 어느 SaaS 로그인이든 될 수 있는 흰 폼이었다.
 *
 * anon 클라이언트(createClient) 대신 admin 을 쓰는 이유: anon 은 쿠키를 읽어야 해서
 * 이 지면이 통째로 동적 렌더가 된다. 로그인 화면은 자주 열리는데 매번 DB 를 칠 이유가 없다.
 * 대신 RLS 가 해 주던 일(승인 작가만)을 쿼리에서 직접 건다.
 */
export async function fetchAuthBackdropPhotos(limit = 18): Promise<string[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("photos")
    .select(
      "thumb_url, src_url, photographer:photographers!photos_photographer_id_fkey!inner(id, status)"
    )
    .eq("visibility", "published")
    .eq("feed_hidden", false)
    // admin 은 RLS 를 지나치므로 승인 조건을 여기서 직접 건다.
    .eq("photographer.status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return ((data ?? []) as unknown as Array<{ thumb_url: string | null; src_url: string }>)
    .map((p) => p.thumb_url ?? p.src_url)
    .filter(Boolean);
}

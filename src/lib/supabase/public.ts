import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * 쿠키를 읽지 않는 anon 클라이언트 — **빌드 타임 프리렌더용**.
 *
 * 서버에는 원래 두 가지밖에 없었다.
 *   · server.ts  — createServerClient + cookies(). 로그인 상태가 필요할 때.
 *                  cookies() 를 부르는 순간 그 라우트는 통째로 동적 렌더가 된다.
 *   · admin.ts   — service_role. RLS 를 통째로 우회한다.
 *
 * 그래서 "로그인 상태는 필요 없는데 정적으로 굽고 싶은" 조회는 갈 데가 없었고,
 * 실제로 admin 을 쓰게 됐다(auth-backdrop). 그 대가가 컸다 —
 * **Vercel Preview 스코프에는 SUPABASE_SERVICE_ROLE_KEY 가 없어서 빌드가 죽는다.**
 * (/login 은 revalidate=86400 이라 빌드 타임에 프리렌더된다 → "supabaseKey is required")
 *
 * 이 클라이언트는 쿠키를 안 읽으므로 정적 렌더를 깨지 않고, anon 이라 RLS 가 그대로 산다.
 * 공개 데이터만 읽는 프리렌더 조회는 여기를 쓸 것. 권한이 필요하면 그건 admin 의 일이다.
 */
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

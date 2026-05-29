import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * 서버 컴포넌트·라우트 핸들러용 Supabase 클라이언트.
 * anon 키 + 사용자 세션 쿠키 → RLS는 로그인 사용자 기준으로 적용된다.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          // 서버 컴포넌트에서 호출되면 set이 막힐 수 있음 — 미들웨어가 세션 갱신을 담당하므로 무시 가능.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // 서버 컴포넌트 렌더 중 set 시도 — 무시
          }
        },
      },
    }
  );
}

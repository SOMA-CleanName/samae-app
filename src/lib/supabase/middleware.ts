import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * 매 요청마다 Supabase 세션 쿠키를 갱신한다.
 * (App Router 권장 패턴 — 서버 컴포넌트는 쿠키 set이 제한되므로 미들웨어가 담당)
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // 세션 쿠키가 없으면(비로그인·프리패치 등) 갱신할 토큰이 없으므로
  // Auth 서버 왕복을 생략한다 — 로그아웃 트래픽의 불필요한 네트워크 비용 제거.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  if (!hasAuthCookie) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser()를 호출해야 만료 토큰이 갱신된다.
  await supabase.auth.getUser();

  return response;
}

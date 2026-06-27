import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";

const OAUTH_NEXT_COOKIE = "samae_oauth_next";

/**
 * OAuth(카카오) 및 이메일 매직링크 콜백 — 인가 코드를 세션으로 교환.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const cookieNext = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${OAUTH_NEXT_COOKIE}=`))
    ?.slice(OAUTH_NEXT_COOKIE.length + 1);
  const next = safeNext(searchParams.get("next") ?? decodeCookieNext(cookieNext), "/studio"); // 오픈 리다이렉트 방지

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const res = NextResponse.redirect(`${origin}${next}`);
      res.cookies.delete(OAUTH_NEXT_COOKIE);
      return res;
    }
  }

  const res = NextResponse.redirect(`${origin}/login?error=auth`);
  res.cookies.delete(OAUTH_NEXT_COOKIE);
  return res;
}

function decodeCookieNext(value: string | undefined) {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

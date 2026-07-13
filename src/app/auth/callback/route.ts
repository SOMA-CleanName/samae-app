import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";
import { readAnonFavPhotoIds, ANON_FAV_COOKIE } from "@/lib/anon-favorites";

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
      // 비로그인 중 쿠키에 쌓인 관심사진 → 계정 favorites 로 병합(중복 무시) 후 쿠키 비움
      await mergeAnonFavorites(supabase);
      const res = NextResponse.redirect(`${origin}${next}`);
      res.cookies.delete(OAUTH_NEXT_COOKIE);
      res.cookies.delete(ANON_FAV_COOKIE);
      return res;
    }
  }

  const res = NextResponse.redirect(`${origin}/login?error=auth`);
  res.cookies.delete(OAUTH_NEXT_COOKIE);
  return res;
}

// 비로그인 관심사진(쿠키) → 로그인 계정 favorites 병합. 실패해도 로그인 흐름은 계속.
async function mergeAnonFavorites(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<void> {
  try {
    const ids = await readAnonFavPhotoIds();
    if (ids.length === 0) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("favorites").upsert(
      ids.map((target_id) => ({ profile_id: user.id, target_type: "photo", target_id })),
      { onConflict: "profile_id,target_type,target_id", ignoreDuplicates: true }
    );
  } catch {
    /* 병합 실패는 무시 — 쿠키는 아래에서 어차피 비워짐 */
  }
}

function decodeCookieNext(value: string | undefined) {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

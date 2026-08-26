import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestOrigin, safeNext } from "@/lib/safe-redirect";
import { readAnonFavPhotoIds, ANON_FAV_COOKIE } from "@/lib/anon-favorites";

const OAUTH_NEXT_COOKIE = "samae_oauth_next";

/**
 * OAuth(카카오) 및 이메일 매직링크 콜백 — 인가 코드를 세션으로 교환.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = requestOrigin(request); // request.url 의 origin 은 dev 원격 접속에서 localhost 로 보고됨
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
      // 연락처 없는 계정(첫 소셜 가입 포함) → 가입 마무리(전화번호 등록)를 거쳐 복귀.
      // SMS(작가 답장 알림)가 profiles.phone 에 의존하므로 이 단계는 건너뛸 수 없다.
      const dest = (await needsContact(supabase))
        ? `/signup/contact?next=${encodeURIComponent(next)}`
        : next;
      const res = NextResponse.redirect(`${origin}${dest}`);
      res.cookies.delete(OAUTH_NEXT_COOKIE);
      res.cookies.delete(ANON_FAV_COOKIE);
      return res;
    }
  }

  const res = NextResponse.redirect(`${origin}/login?error=auth`);
  res.cookies.delete(OAUTH_NEXT_COOKIE);
  return res;
}

// profiles.phone 이 없으면 true — 조회 실패 시 false(로그인 흐름을 막지 않는다).
async function needsContact(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", user.id)
      .maybeSingle();
    return !profile?.phone;
  } catch {
    return false;
  }
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

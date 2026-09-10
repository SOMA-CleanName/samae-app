import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestOrigin, safeNext } from "@/lib/safe-redirect";
import { readAnonFavPhotoIds, ANON_FAV_COOKIE } from "@/lib/anon-favorites";
import { extractKakaoPhone } from "@/lib/kakao-phone";

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
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // 비로그인 중 쿠키에 쌓인 관심사진 → 계정 favorites 로 병합(중복 무시) 후 쿠키 비움
      await mergeAnonFavorites(supabase);
      // 카카오싱크 동의로 번호가 넘어왔으면 여기서 채운다 — 카카오가 검증한 번호라
      // 우리 OTP 를 다시 받을 이유가 없다. 그러면 아래 needsContact 가 false 가 되어
      // /signup/contact 를 통째로 건너뛴다(간편가입이 실제로 간편해지는 지점).
      await adoptKakaoPhone(supabase);
      // 연락처 없는 계정(첫 소셜 가입 포함) → 가입 마무리(전화번호 등록)를 거쳐 복귀.
      // SMS(작가 답장 알림)가 profiles.phone 에 의존하므로 이 단계는 건너뛸 수 없다.
      const dest = (await needsContact(supabase))
        ? `/signup/contact?next=${encodeURIComponent(next)}`
        : next;
      const res = NextResponse.redirect(`${origin}${dest}`);
      res.cookies.delete(OAUTH_NEXT_COOKIE);
      res.cookies.delete(ANON_FAV_COOKIE);
      // dev 전용 — 카카오 "나에게 보내기" 실험(/dev/kakao-memo)용 provider 토큰 스태시.
      // 프로덕션 채택 시엔 쿠키가 아니라 DB(암호화)에 저장·리프레시하는 본구현으로 교체.
      if (process.env.NODE_ENV !== "production" && data?.session?.provider_token) {
        res.cookies.set("kakao_pt_dev", data.session.provider_token, {
          httpOnly: true,
          maxAge: 6 * 3600,
          path: "/",
          sameSite: "lax",
        });
      }
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

/**
 * 카카오싱크 동의로 받은 전화번호를 profiles.phone 에 채운다.
 *
 * 세 가지를 지킨다 —
 *   · **덮어쓰지 않는다.** 이미 번호가 있으면 그게 우선(사용자가 OTP 로 직접 인증했거나,
 *     카카오 계정 번호와 실제 쓰는 번호가 다를 수 있다)
 *   · **실패해도 로그인을 막지 않는다.** 못 채우면 기존 OTP 화면으로 떨어질 뿐이다
 *   · **동의 전에도 안전하다.** 검수 통과 전에는 metadata 에 번호가 없어 그냥 no-op 이다
 */
async function adoptKakaoPhone(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const phone = extractKakaoPhone(user.user_metadata);
    if (!phone) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.phone) return; // 이미 있는 번호를 카카오 번호로 갈아치우지 않는다

    await supabase.from("profiles").update({ phone }).eq("id", user.id);
  } catch {
    /* 못 채우면 /signup/contact 가 받는다 — 로그인은 계속되어야 한다 */
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

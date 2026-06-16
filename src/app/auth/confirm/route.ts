import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * 이메일 인증 확인 — 메일 링크의 token_hash 를 검증(verifyOtp).
 * PKCE code 방식과 달리 code_verifier 쿠키가 필요 없어 다른 기기에서 열어도 동작한다.
 * 검증 후에는 세션을 두지 않고 로그인 페이지로 보내 다시 로그인하도록 유도한다.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/login?verified=1";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      // 인증만 하고 명시적으로 로그인 유도 (세션 정리)
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=verify`);
}

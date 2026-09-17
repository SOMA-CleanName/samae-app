import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";
import { TERMS_VERSION } from "@/lib/policy-version";
import { termsConsentIsCurrent } from "@/lib/consent";
import { ConsentBody } from "./ConsentBody";

// 회원 약관 동의 — **우리 화면 하나로 받는다.**
//
// 카카오 간편가입을 켠 뒤로 신규 가입자의 약관은 카카오 동의 화면에서 받고,
// /auth/callback 의 adoptKakaoServiceTerms() 가 그걸 우리 기록으로 옮긴다.
// 그러니 정상적으로 새로 가입한 카카오 사용자는 여기 오지 않는다.
//
// 그래도 오는 사람들이 있다:
//   · 간편가입을 켜기 전에 가입한 기존 회원 (지금 17명)
//   · service_terms 조회 실패·타임아웃(4초), KAKAO_TERMS_TAGS 설정 오류
//   · **약관을 개정해 재동의가 필요해진 회원** (terms_version 이 달라진다)
//
// ⚠️ **그 사람들을 카카오로 보내지 않는다.** 전에는 "같은 약관을 두 군데서 받으면
//    어디서 받은 동의인지 갈린다" 는 이유로 카카오 버튼을 뒀는데, 그게 성립하지
//    않는다는 걸 실측으로 확인했다(2026-09-16):
//
//    카카오는 간편가입 약관 화면을 **최초 연결 때만** 띄운다(REST API 문서).
//    여기 오는 사람은 전부 이미 연결된 계정이라 동의 화면 없이 그대로 되돌아온다.
//    받아지는 건 없고 왕복만 남는데, 그 왕복 하나가 액세스 토큰 발급 1회라
//    사용자당 10분 20개 제한을 태운다. 실제로 태워 KOE237 로 로그인이 통째로 죽었다.
//
//    그래서 기존 회원·재동의는 여기서 끝낸다. 우리가 받아야 하는 동의이고,
//    우리 기록(profiles.terms_agreed_at)에 버전까지 남는다.
export default async function SignupConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next, "/");

  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(`/signup/consent?next=${next}`)}`);

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("terms_agreed_at, terms_version")
    .eq("id", me.id)
    .maybeSingle();
  // 버전까지 맞아야 통과 — 개정했는데 옛 동의로 지나가면 개정한 의미가 없다
  if (termsConsentIsCurrent(profile)) redirect(next);

  // 이미 한 번 동의한 적이 있으면 **가입이 아니라 재동의**다. 문구도 출구도 달라야 한다 —
  // 기존 회원에게 "동의하지 않으면 가입을 진행할 수 없어요" 는 말이 안 되고,
  // 약관 부칙이 약속한 "동의하지 않을 자유" 가 그 화면에 있어야 한다(2026-09-17 점검).
  return (
    <ConsentBody
      next={next}
      termsVersion={TERMS_VERSION}
      displayName={me.displayName}
      revisit={!!profile?.terms_agreed_at}
    />
  );
}

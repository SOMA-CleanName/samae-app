import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";
import { TERMS_VERSION } from "@/lib/policy-version";
import { termsConsentIsCurrent } from "@/lib/consent";
import { kakaoTermsTagsParam } from "@/lib/kakao-terms";
import { KakaoTermsConsentButton } from "@/components/user/KakaoTermsConsentButton";
import { ConsentBody } from "./ConsentBody";

// 가입 마무리 — 약관 동의. 로그인 콜백이 **현재 버전 동의가 없는** 사용자를 이리로 보낸다.
//
// ⚠️ 이 지면은 이제 **폴백**이다. 카카오 간편가입을 켠 뒤로 회원 약관은 카카오 동의
//    화면에서 받고, /auth/callback 의 adoptKakaoServiceTerms() 가 그걸 우리 기록으로
//    옮긴다. 그러니 정상적으로 가입한 카카오 사용자는 여기 오지 않는다.
//
// 그래도 오는 사람들이 있다:
//   · 간편가입을 켜기 전에 가입한 기존 회원 (지금 17명)
//   · service_terms 조회 실패·타임아웃(4초), KAKAO_TERMS_TAGS 설정 오류
//   · **약관을 개정해 재동의가 필요해진 회원** (terms_version 이 달라진다)
//
// 카카오 계정이면 **체크박스를 다시 보이지 않고 카카오로 보낸다** — 같은 약관을 두
// 군데서 받으면 "어디서 받은 동의인가" 가 갈린다. 이메일 계정만 체크박스 폼을 쓴다.
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
  const [{ data: profile }, { data: auth }] = await Promise.all([
    supabase.from("profiles").select("terms_agreed_at, terms_version").eq("id", me.id).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  // 버전까지 맞아야 통과 — 개정했는데 옛 동의로 지나가면 개정한 의미가 없다
  if (termsConsentIsCurrent(profile)) redirect(next);

  const providers = (auth.user?.app_metadata?.providers as string[] | undefined) ?? [];
  const tags = kakaoTermsTagsParam();
  const viaKakao = providers.includes("kakao") && !!tags;

  if (viaKakao) {
    const revisit = !!profile?.terms_agreed_at; // 처음이 아니라 개정에 따른 재동의인가
    return (
      <main className="mx-auto max-w-sm px-5 py-12 font-kr">
        <h1 className="text-h1 font-bold tracking-tight">
          {revisit ? "약관이 바뀌었어요" : "약관에 동의해 주세요"}
        </h1>
        <p className="mt-3 text-body leading-relaxed text-muted">
          {me.displayName ? `${me.displayName}님, ` : ""}
          {revisit
            ? "서비스 이용약관과 개인정보 처리방침이 개정됐어요. 카카오에서 바뀐 내용을 확인하고 동의해 주세요."
            : "사매를 이용하려면 서비스 이용약관과 개인정보 처리방침에 동의가 필요해요."}
        </p>

        <div className="mt-8">
          <KakaoTermsConsentButton next={next} tags={tags!} />
        </div>
        <p className="mt-2.5 text-center text-caption text-faint">
          이미 동의한 항목은 빼고 필요한 것만 보여드려요
        </p>

        <p className="mt-7 text-caption leading-relaxed text-muted">
          동의하지 않으면 서비스를 이용할 수 없어요. 본문은{" "}
          <a href="/terms" target="_blank" className="underline underline-offset-2 hover:text-fg">
            이용약관
          </a>
          ·{" "}
          <a href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-fg">
            개인정보 처리방침
          </a>
          에서 볼 수 있어요.
        </p>
      </main>
    );
  }

  // 이메일 계정 — 카카오로 보낼 수 없으니 체크박스 폼으로 받는다
  return <ConsentBody next={next} termsVersion={TERMS_VERSION} displayName={me.displayName} />;
}

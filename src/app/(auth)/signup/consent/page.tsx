import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";
import { TERMS_VERSION } from "@/lib/policy-version";
import { ConsentForm } from "./ConsentForm";

// 가입 마무리 — 약관 동의 (로그인 콜백이 profiles.terms_agreed_at 없는 사용자를 이리로 보낸다).
// 카카오 간편가입은 가입 폼을 거치지 않아 체크박스를 받을 자리가 여기뿐이다.
// 이미 동의했으면 바로 원래 흐름(next)으로 통과.
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
    .select("terms_agreed_at")
    .eq("id", me.id)
    .maybeSingle();
  if (profile?.terms_agreed_at) redirect(next);

  return (
    <main className="mx-auto max-w-sm px-5 py-12 font-kr">
      <h1 className="text-2xl font-bold tracking-tight">약관에 동의해 주세요</h1>
      <p className="mt-2 text-sm text-muted">
        {me.displayName ? `${me.displayName}님, ` : ""}사매를 이용하려면 아래 두 문서에 동의가 필요해요.
        본문은 링크에서 읽을 수 있어요.
      </p>
      <ConsentForm next={next} termsVersion={TERMS_VERSION} />
      <p className="mt-6 text-xs leading-relaxed text-faint">
        동의하지 않으면 가입을 진행할 수 없어요.{" "}
        <Link href="/" className="underline underline-offset-2">
          홈으로 돌아가기
        </Link>
      </p>
    </main>
  );
}

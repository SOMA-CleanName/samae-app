import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";
import { loadPhoneConsentState } from "@/lib/phone-consent";
import ContactForm from "./ContactForm";

// 가입 마무리 — 연락처 등록 (로그인 콜백이 profiles.phone 없는 사용자를 이리로 보낸다).
// 이미 번호가 있으면 바로 원래 흐름(next)으로 통과.
export default async function SignupContactPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; preview?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next, "/");

  // dev 편의 토글 — ?preview=1 이면 가드(로그인·번호 보유) 없이 UI 만 확인 (봇의 gate=1 과 동일 패턴)
  if (process.env.NODE_ENV !== "production" && sp.preview === "1")
    return <ContactForm next={next} displayName="정훈" canAskKakao />;

  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(`/signup/contact?next=${next}`)}`);

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", me.id)
    .maybeSingle();
  if (profile?.phone) redirect(next);

  // 카카오 계정이면 동의 한 번으로 끝난다 — OTP(번호 입력 + 문자 6자리)는 아래 대안으로 남긴다.
  // /chat/start 가 번호 없는 사용자를 여기로 떨어뜨리므로, 상담 진입의 마찰이 곧 이 화면이다.
  const { canAskKakao } = await loadPhoneConsentState();

  return (
    <ContactForm next={next} displayName={me.displayName ?? null} canAskKakao={canAskKakao} />
  );
}

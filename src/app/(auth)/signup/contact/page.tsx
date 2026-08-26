import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";
import ContactForm from "./ContactForm";

// 가입 마무리 — 연락처 등록 (로그인 콜백이 profiles.phone 없는 사용자를 이리로 보낸다).
// 이미 번호가 있으면 바로 원래 흐름(next)으로 통과.
export default async function SignupContactPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next, "/");

  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(`/signup/contact?next=${next}`)}`);

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", me.id)
    .maybeSingle();
  if (profile?.phone) redirect(next);

  return <ContactForm next={next} displayName={me.displayName ?? null} />;
}

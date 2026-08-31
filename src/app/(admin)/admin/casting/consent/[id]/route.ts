import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CASTING_BUCKET } from "@/lib/casting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 보호자 동의서 열람 — 클릭할 때마다 5분짜리 서명 URL 을 새로 발급해 리다이렉트한다.
//
// ⚠️ 서명 URL 을 페이지 HTML 에 미리 박아두지 않는 이유: 동의서에는 미성년자와 보호자의
//    실명·연락처·서명이 들어간다. HTML 에 있으면 화면 캡처·소스 복사로 새어나가고,
//    한 번 새어나간 URL 은 만료 전까지 회수할 방법이 없다. "열람 = 명시적 클릭" 으로 좁힌다.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return new Response("권한이 없습니다.", { status: 403 });
  }

  const { id } = await ctx.params;
  const admin = createAdminClient();

  const { data: app } = await admin
    .from("casting_applications")
    .select("guardian_consent_path")
    .eq("id", id)
    .maybeSingle();

  const path = app?.guardian_consent_path as string | null | undefined;
  if (!path) return new Response("등록된 동의서가 없습니다.", { status: 404 });

  const { data, error } = await admin.storage.from(CASTING_BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) return new Response("열람 링크를 만들지 못했습니다.", { status: 500 });

  return Response.redirect(data.signedUrl, 302);
}

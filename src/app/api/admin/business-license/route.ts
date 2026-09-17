import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const BUCKET = "samae-license";
/** 서명 URL 수명. 보고 판단하기엔 충분하고, 흘러나가도 곧 죽는다 */
const TTL_SEC = 300;

/**
 * 사업자등록증 열람 — **어드민만.**
 *
 * 비공개 버킷이라 경로를 알아도 직접 못 받는다(0124). 어드민이 요청한 순간에만
 * 만료형 서명 URL 을 만들어 준다. 링크를 지면에 박아 두지 않는 이유는 그 지면이
 * 캐시되거나 공유되면 링크도 같이 새기 때문이다 — 누를 때 만든다.
 *
 * 라우트 핸들러는 레이아웃 가드를 물려받지 않는다. 여기서 직접 role 을 본다.
 */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") {
    return Response.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const photographerId = new URL(req.url).searchParams.get("photographerId");
  if (!photographerId) return Response.json({ error: "작가를 지정해주세요." }, { status: 400 });

  const admin = createAdminClient();
  const { data: ph } = await admin
    .from("photographers")
    .select("business_license_path")
    .eq("id", photographerId)
    .maybeSingle();

  const path = ph?.business_license_path as string | null | undefined;
  if (!path) return Response.json({ error: "올라온 등록증이 없어요." }, { status: 404 });

  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, TTL_SEC);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ url: data.signedUrl, expiresInSec: TTL_SEC });
}

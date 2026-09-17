import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const BUCKET = "samae-license";
const MAX_BYTES = 10 * 1024 * 1024;
/** 등록증은 대개 PDF 아니면 스캔·촬영 이미지다 */
const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];

/**
 * 사업자등록증 업로드 — 본인 작가 건만.
 *
 * ⚠️ **공개 URL 을 만들지 않는다.** 등록증에는 대표자 성명과 사업장 주소가 들어 있다.
 *    비공개 버킷(0124)에 넣고 경로만 저장하며, 열람은 어드민이 요청할 때 만료형 서명
 *    URL 로만 내준다. 아바타처럼 getPublicUrl 을 부르면 경로만 알면 누구나 받아 간다.
 *
 * ⚠️ 이미지도 **리사이즈하지 않는다.** 아바타와 다른 점이다. 어드민이 상호·대표자·번호를
 *    눈으로 대조해야 하는 서류라, 줄이면 글자가 뭉개져 확인 자체가 안 된다.
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!me.photographer) return Response.json({ error: "작가만 올릴 수 있어요." }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "파일이 없어요." }, { status: 400 });
  if (!ALLOWED.includes(file.type)) {
    return Response.json({ error: "PDF 또는 이미지 파일만 올릴 수 있어요." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "10MB 이하로 올려주세요." }, { status: 400 });
  }

  const admin = createAdminClient();
  // 원본 파일명을 쓰지 않는다 — 이름에 개인정보(성명·주민번호 앞자리)가 담겨 오는 일이 잦다
  const ext = file.type === "application/pdf" ? "pdf" : (file.type.split("/")[1] ?? "jpg");
  const path = `${me.photographer.id}/${randomUUID()}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const up = await admin.storage.from(BUCKET).upload(path, buf, { contentType: file.type });
  if (up.error) return Response.json({ error: up.error.message }, { status: 500 });

  // 이전 파일은 갈아치운다 — 여러 장을 남겨 둘 이유가 없고, 남기면 어느 게 최신인지 갈린다
  const { data: prev } = await admin
    .from("photographers")
    .select("business_license_path")
    .eq("id", me.photographer.id)
    .maybeSingle();

  const { error } = await admin
    .from("photographers")
    .update({
      business_license_path: path,
      business_license_uploaded_at: new Date().toISOString(),
      // 파일이 바뀌면 이전 확인은 무효다. 어드민이 다시 봐야 한다
      business_license_verified_at: null,
      business_license_verified_by: null,
    })
    .eq("id", me.photographer.id);

  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const old = prev?.business_license_path as string | null | undefined;
  if (old && old !== path) await admin.storage.from(BUCKET).remove([old]);

  return Response.json({ ok: true, name: file.name, size: file.size });
}

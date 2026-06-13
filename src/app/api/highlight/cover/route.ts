import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const BUCKET = "samae-highlight";
const MAX_BYTES = 8 * 1024 * 1024;

// 하이라이트 커버 업로드 — 작가만, 정사각 256px 썸네일로 공개 버킷에 저장하고 URL 반환.
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me?.photographer) return Response.json({ error: "작가만 가능합니다." }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "파일 없음" }, { status: 400 });
  if (!file.type.startsWith("image/")) return Response.json({ error: "이미지만 가능" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "8MB 이하" }, { status: 400 });

  const sharp = (await import("sharp")).default;
  const input = Buffer.from(await file.arrayBuffer());
  const buf = await sharp(input).rotate().resize(256, 256, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();

  const admin = createAdminClient();
  const path = `${me.photographer.id}/${randomUUID()}.jpg`;
  const up = await admin.storage.from(BUCKET).upload(path, buf, { contentType: "image/jpeg" });
  if (up.error) return Response.json({ error: up.error.message }, { status: 500 });

  const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return Response.json({ ok: true, url });
}

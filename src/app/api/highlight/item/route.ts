import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const BUCKET = "samae-highlight";
const MAX_BYTES = 12 * 1024 * 1024;
// 스토리 비율 9:16 — 클라이언트에서 크롭해 보내고, 서버는 표준 해상도로 정규화한다.
const W = 1080;
const H = 1920;

// 하이라이트 항목 이미지 업로드 — 작가만. 9:16(1080×1920)로 정규화해 공개 버킷에 저장하고 URL 반환.
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me?.photographer) return Response.json({ error: "작가만 가능합니다." }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "파일 없음" }, { status: 400 });
  if (!file.type.startsWith("image/")) return Response.json({ error: "이미지만 가능" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "12MB 이하" }, { status: 400 });

  const sharp = (await import("sharp")).default;
  const input = Buffer.from(await file.arrayBuffer());
  const buf = await sharp(input).rotate().resize(W, H, { fit: "cover" }).jpeg({ quality: 84 }).toBuffer();

  const admin = createAdminClient();
  const path = `${me.photographer.id}/items/${randomUUID()}.jpg`;
  const up = await admin.storage.from(BUCKET).upload(path, buf, { contentType: "image/jpeg" });
  if (up.error) return Response.json({ error: up.error.message }, { status: 500 });

  const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return Response.json({ ok: true, url });
}

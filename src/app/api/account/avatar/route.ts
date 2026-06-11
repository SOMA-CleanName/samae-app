import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const BUCKET = "samae-avatar";
const MAX_BYTES = 8 * 1024 * 1024;

// 아바타 업로드 — 본인만, 정사각 리사이즈 후 공개 버킷에 저장하고 profiles.avatar_url 갱신
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "파일 없음" }, { status: 400 });
  if (!file.type.startsWith("image/")) return Response.json({ error: "이미지만 가능" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "8MB 이하" }, { status: 400 });

  // 정사각 256px 썸네일로 리사이즈
  const sharp = (await import("sharp")).default;
  const input = Buffer.from(await file.arrayBuffer());
  const buf = await sharp(input)
    .rotate()
    .resize(256, 256, { fit: "cover" })
    .jpeg({ quality: 82 })
    .toBuffer();

  const admin = createAdminClient();
  const path = `${me.id}/${randomUUID()}.jpg`;
  const up = await admin.storage.from(BUCKET).upload(path, buf, { contentType: "image/jpeg" });
  if (up.error) return Response.json({ error: up.error.message }, { status: 500 });
  const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const { error } = await admin.from("profiles").update({ avatar_url: url }).eq("id", me.id);
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    return Response.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/settings");
  return Response.json({ ok: true, url });
}

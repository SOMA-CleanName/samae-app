import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs"; // sharp 필요

const BUCKET = "samae-about";
const MAX_BYTES = 15 * 1024 * 1024; // 15MB

// 소개(무드) 페이지 섹션 이미지 업로드 — 리사이즈 + 썸네일 생성 후 Storage 저장.
// DB 반영은 하지 않고 이미지 정보만 반환한다(섹션 content 에는 서버 액션으로 저장).
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me?.photographer) {
    return Response.json({ error: "작가만 업로드할 수 있습니다." }, { status: 403 });
  }
  const photographerId = me.photographer.id;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "파일이 없습니다." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "이미지 파일만 가능합니다." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "15MB 이하만 업로드할 수 있습니다." }, { status: 400 });
  }

  let mainBuf: Buffer;
  let thumbBuf: Buffer;
  let mainMeta: { width?: number; height?: number };
  try {
    const sharp = (await import("sharp")).default;
    const input = Buffer.from(await file.arrayBuffer());
    const oriented = sharp(input).rotate(); // EXIF 회전 보정

    mainBuf = await oriented
      .clone()
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    mainMeta = await sharp(mainBuf).metadata();

    thumbBuf = await oriented
      .clone()
      .resize({ width: 500, withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();
  } catch {
    return Response.json(
      { error: "이미지를 처리할 수 없어요. HEIC(아이폰 원본) 형식이면 JPG로 바꿔 다시 올려주세요." },
      { status: 422 }
    );
  }

  const admin = createAdminClient();
  const base = `${photographerId}/${randomUUID()}`;
  const mainPath = `${base}.jpg`;
  const thumbPath = `${base}_thumb.jpg`;

  const up1 = await admin.storage.from(BUCKET).upload(mainPath, mainBuf, {
    contentType: "image/jpeg",
  });
  if (up1.error) return Response.json({ error: up1.error.message }, { status: 500 });

  const up2 = await admin.storage.from(BUCKET).upload(thumbPath, thumbBuf, {
    contentType: "image/jpeg",
  });
  if (up2.error) {
    await admin.storage.from(BUCKET).remove([mainPath]);
    return Response.json({ error: up2.error.message }, { status: 500 });
  }

  return Response.json({
    url: admin.storage.from(BUCKET).getPublicUrl(mainPath).data.publicUrl,
    thumbUrl: admin.storage.from(BUCKET).getPublicUrl(thumbPath).data.publicUrl,
    width: mainMeta.width ?? null,
    height: mainMeta.height ?? null,
  });
}

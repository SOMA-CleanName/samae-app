import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs"; // sharp 필요

const BUCKET = "samae-portfolio";
const MAX_BYTES = 15 * 1024 * 1024;

// 사진 교체 — 기존 사진의 이미지 파일만 새 것으로 바꾼다(메타·피드·위치 유지).
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me?.photographer) {
    return Response.json({ error: "작가만 가능합니다." }, { status: 403 });
  }
  const photographerId = me.photographer.id;

  const form = await req.formData();
  const photoId = String(form.get("photoId") ?? "");
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "파일이 없습니다." }, { status: 400 });
  if (!file.type.startsWith("image/")) return Response.json({ error: "이미지만 가능" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "15MB 이하" }, { status: 400 });

  const admin = createAdminClient();

  // 소유 검증 + 기존 경로 확보
  const { data: photo } = await admin
    .from("photos")
    .select("photographer_id, storage_path")
    .eq("id", photoId)
    .single();
  if (!photo || photo.photographer_id !== photographerId) {
    return Response.json({ error: "권한 없음" }, { status: 403 });
  }

  // 리사이즈 (업로드와 동일)
  const sharp = (await import("sharp")).default;
  const input = Buffer.from(await file.arrayBuffer());
  const oriented = sharp(input).rotate();
  const mainBuf = await oriented.clone().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  const mainMeta = await sharp(mainBuf).metadata();
  const thumbBuf = await oriented.clone().resize({ width: 500, withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();

  // 새 경로에 업로드
  const base = `${photographerId}/${randomUUID()}`;
  const mainPath = `${base}.jpg`;
  const thumbPath = `${base}_thumb.jpg`;
  const up1 = await admin.storage.from(BUCKET).upload(mainPath, mainBuf, { contentType: "image/jpeg" });
  if (up1.error) return Response.json({ error: up1.error.message }, { status: 500 });
  const up2 = await admin.storage.from(BUCKET).upload(thumbPath, thumbBuf, { contentType: "image/jpeg" });
  if (up2.error) {
    await admin.storage.from(BUCKET).remove([mainPath]);
    return Response.json({ error: up2.error.message }, { status: 500 });
  }

  const srcUrl = admin.storage.from(BUCKET).getPublicUrl(mainPath).data.publicUrl;
  const thumbUrl = admin.storage.from(BUCKET).getPublicUrl(thumbPath).data.publicUrl;

  // 행 갱신 (이미지 관련 필드만)
  const { error: updErr } = await admin
    .from("photos")
    .update({
      storage_path: mainPath,
      src_url: srcUrl,
      thumb_url: thumbUrl,
      width: mainMeta.width ?? 0,
      height: mainMeta.height ?? 0,
    })
    .eq("id", photoId);
  if (updErr) {
    await admin.storage.from(BUCKET).remove([mainPath, thumbPath]);
    return Response.json({ error: updErr.message }, { status: 500 });
  }

  // 기존 파일 정리 (원본 + 썸네일)
  const oldMain = photo.storage_path as string;
  const oldThumb = oldMain.replace(/\.jpg$/, "_thumb.jpg");
  await admin.storage.from(BUCKET).remove([oldMain, oldThumb]);

  return Response.json({ ok: true, thumb_url: thumbUrl, src_url: srcUrl });
}

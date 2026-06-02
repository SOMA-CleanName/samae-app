import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs"; // sharp 필요

const BUCKET = "samae-portfolio";
const MAX_BYTES = 15 * 1024 * 1024; // 15MB

// 포트폴리오 사진 업로드 — 원본 리사이즈 + 썸네일 생성 후 Storage 저장, photos 행 생성.
// 소유권은 서버에서 검증하고 업로드는 service_role 로 수행.
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

  // 이미지 변환 (sharp)
  const sharp = (await import("sharp")).default;
  const input = Buffer.from(await file.arrayBuffer());
  const oriented = sharp(input).rotate(); // EXIF 회전 보정

  const mainBuf = await oriented
    .clone()
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  const mainMeta = await sharp(mainBuf).metadata();

  // 썸네일도 원본 비율 유지 (비정형 메이슨리 그리드용) — 폭만 제한
  const thumbBuf = await oriented
    .clone()
    .resize({ width: 500, withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer();

  // Storage 업로드 (service_role)
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

  const srcUrl = admin.storage.from(BUCKET).getPublicUrl(mainPath).data.publicUrl;
  const thumbUrl = admin.storage.from(BUCKET).getPublicUrl(thumbPath).data.publicUrl;

  // 작가 기본 지역/무드를 사진 기본값으로 (탐색 필터용)
  const { data: ph } = await admin
    .from("photographers")
    .select("regions, mood_tags")
    .eq("id", photographerId)
    .single();

  const { error: insErr } = await admin.from("photos").insert({
    photographer_id: photographerId,
    storage_path: mainPath,
    src_url: srcUrl,
    thumb_url: thumbUrl,
    width: mainMeta.width ?? 0,
    height: mainMeta.height ?? 0,
    region: ph?.regions?.[0] ?? null,
    mood_tags: ph?.mood_tags ?? [],
    visibility: "draft",
  });
  if (insErr) {
    await admin.storage.from(BUCKET).remove([mainPath, thumbPath]);
    return Response.json({ error: insErr.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

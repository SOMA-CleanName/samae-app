import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const BUCKET = "samae-chat";
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_IMAGES = 5;

// 상담 정보 저장(업서트) — 고객만. 레퍼런스 사진 업로드 + 텍스트 필드 upsert.
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const form = await req.formData();
  const conversationId = String(form.get("conversationId"));

  // 참여자(고객) 검증 — 상담 정보는 고객만 작성
  const supabase = await createClient();
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, user_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv || conv.user_id !== me.id) {
    return Response.json({ error: "권한 없음" }, { status: 403 });
  }

  // 레퍼런스 이미지: 유지할 기존 URL + 새 업로드 파일
  const keep = form.getAll("keep").map(String).filter(Boolean);
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  const refImages = await buildRefImages(conversationId, keep, files);

  // 기존 brief 확인(첫 작성 여부) + 제거된 이미지 정리
  const admin = createAdminClient();
  const { data: prev } = await admin
    .from("consultation_briefs")
    .select("ref_image_paths")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  await cleanupRemovedImages(prev?.ref_image_paths as string[] | undefined, refImages);

  const { error } = await admin.from("consultation_briefs").upsert(
    {
      conversation_id: conversationId,
      gender: fieldStr(form, "gender"),
      party_size: fieldNum(form, "party_size"),
      purpose: fieldStr(form, "purpose"),
      preferred_date: fieldStr(form, "preferred_date"),
      region: fieldStr(form, "region"),
      note: fieldStr(form, "note"),
      ref_image_paths: refImages,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id" }
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // 첫 작성이면 작가에게 시스템 메시지로 알림(트리거가 안읽음·알림 처리)
  if (!prev) {
    await admin.from("messages").insert({
      conversation_id: conversationId,
      sender_id: me.id,
      type: "system",
      body: "📋 고객이 상담 정보를 작성했어요.",
    });
  }

  return Response.json({ ok: true });
}

// 유지 이미지 + 새 업로드를 합쳐 최대 5장의 public URL 배열 생성
async function buildRefImages(
  conversationId: string,
  keep: string[],
  files: File[]
): Promise<string[]> {
  const admin = createAdminClient();
  const sharp = (await import("sharp")).default;
  const uploaded: string[] = [];

  for (const file of files) {
    if (keep.length + uploaded.length >= MAX_IMAGES) break;
    if (!file.type.startsWith("image/")) continue;
    if (file.size > MAX_BYTES) continue;

    const buf = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const path = `briefs/${conversationId}/${randomUUID()}.jpg`;
    const up = await admin.storage.from(BUCKET).upload(path, buf, { contentType: "image/jpeg" });
    if (up.error) continue;
    uploaded.push(admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
  }
  return [...keep, ...uploaded].slice(0, MAX_IMAGES);
}

// 이번 저장에서 빠진 기존 이미지를 스토리지에서 제거(고아 방지)
async function cleanupRemovedImages(prevPaths: string[] | undefined, kept: string[]): Promise<void> {
  if (!prevPaths?.length) return;
  const removed = prevPaths.filter((u) => !kept.includes(u));
  const paths = removed.map(urlToStoragePath).filter((p): p is string => !!p);
  if (paths.length) await createAdminClient().storage.from(BUCKET).remove(paths);
}

// 텍스트 필드 → trim, 빈 값은 null
function fieldStr(form: FormData, key: string): string | null {
  const v = form.get(key);
  const s = v == null ? "" : String(v).trim();
  return s || null;
}

// 숫자 필드 → 숫자만 추출, 없으면 null
function fieldNum(form: FormData, key: string): number | null {
  const s = fieldStr(form, key);
  if (!s) return null;
  const n = parseInt(s.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

// public URL → 버킷 내 경로(remove 용)
function urlToStoragePath(url: string): string | null {
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}

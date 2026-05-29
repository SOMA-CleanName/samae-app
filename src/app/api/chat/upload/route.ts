import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const BUCKET = "samae-chat";
const MAX_BYTES = 15 * 1024 * 1024;

// 채팅 이미지 전송 — 참여자 검증 후 리사이즈·업로드하고 image 메시지 생성
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const conversationId = String(form.get("conversationId"));
  if (!(file instanceof File)) return Response.json({ error: "파일 없음" }, { status: 400 });
  if (!file.type.startsWith("image/")) return Response.json({ error: "이미지만 가능" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "15MB 이하" }, { status: 400 });

  // 참여자 검증 (RLS로도 보호되지만 방어적으로)
  const supabase = await createClient();
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, user_id, photographer_id")
    .eq("id", conversationId)
    .maybeSingle();
  const isParticipant =
    conv && (conv.user_id === me.id || conv.photographer_id === me.photographer?.id);
  if (!isParticipant) return Response.json({ error: "권한 없음" }, { status: 403 });

  // 리사이즈
  const sharp = (await import("sharp")).default;
  const input = Buffer.from(await file.arrayBuffer());
  const buf = await sharp(input)
    .rotate()
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  const admin = createAdminClient();
  const path = `${conversationId}/${randomUUID()}.jpg`;
  const up = await admin.storage.from(BUCKET).upload(path, buf, { contentType: "image/jpeg" });
  if (up.error) return Response.json({ error: up.error.message }, { status: 500 });
  const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  // image 메시지 생성 (트리거가 대화 갱신·알림 처리, Realtime 전파)
  const { error } = await admin.from("messages").insert({
    conversation_id: conversationId,
    sender_id: me.id,
    type: "image",
    image_path: url,
  });
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

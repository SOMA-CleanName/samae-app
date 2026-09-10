import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// 챗봇 레퍼런스 이미지 업로드 — 기존 채팅 업로드(/api/chat/upload) 패턴 재사용.
// 차이점: 아직 conversation 이 없으므로(C3 마이그레이션 전) 메시지 insert 없이 URL 만 반환하고,
// 경로를 inquiry-bot/{userId}/ 로 격리한다. C3에서 conversation 생성 후 image 메시지로 승격.
//
// ⚠️ dev 드라이런: 클라이언트(InquiryBotChat)가 DRY_RUN 이면 이 라우트를 호출하지 않는다
//    (objectURL 미리보기만) — 프로드 버킷 오염 방지. 이 라우트 자체는 프로드 경로용으로 완성 상태.

const BUCKET = "samae-chat";
const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "파일 없음" }, { status: 400 });
  if (!file.type.startsWith("image/")) return Response.json({ error: "이미지만 가능" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "15MB 이하" }, { status: 400 });

  // 리사이즈 — 채팅 업로드와 동일 규칙
  const sharp = (await import("sharp")).default;
  const input = Buffer.from(await file.arrayBuffer());
  const buf = await sharp(input)
    .rotate()
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  const admin = createAdminClient();
  const path = `inquiry-bot/${me.id}/${randomUUID()}.jpg`;
  const up = await admin.storage.from(BUCKET).upload(path, buf, { contentType: "image/jpeg" });
  if (up.error) return Response.json({ error: up.error.message }, { status: 500 });
  const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  return Response.json({ ok: true, url });
}

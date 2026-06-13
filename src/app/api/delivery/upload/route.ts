import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DELIVERY_BUCKET, signDeliveryAssets } from "@/lib/deliveries";

export const runtime = "nodejs";

const MAX_BYTES = 50 * 1024 * 1024; // 보정본 1파일 최대 50MB (원본 보존 — 리사이즈 안 함)

// 파일명을 스토리지 키에 안전한 ASCII로 정리.
// Supabase Storage 키는 비ASCII(한글 등)를 허용하지 않아 'Invalid key'가 난다.
// 확장자는 보존하고, 본문이 비면 'photo'로 대체.
function safeName(name: string): string {
  const dot = name.lastIndexOf(".");
  const rawBase = dot > 0 ? name.slice(0, dot) : name;
  const rawExt = dot > 0 ? name.slice(dot + 1) : "";
  const base = rawBase
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
  const ext = rawExt.replace(/[^A-Za-z0-9]/g, "").toLowerCase().slice(0, 8);
  const safeBase = base || "photo";
  return ext ? `${safeBase}.${ext}` : safeBase;
}

// 보정본 업로드 — 작가(예약 소유자)만, paid/shot 단계에서 비공개 버킷에 적재.
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me?.photographer) {
    return Response.json({ error: "작가만 가능합니다." }, { status: 403 });
  }

  const form = await req.formData();
  const bookingId = String(form.get("bookingId"));
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "파일 없음" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "50MB 이하" }, { status: 400 });

  const admin = createAdminClient();

  // 예약 소유·상태 검증 (보정본은 결제 이후에만)
  const { data: b } = await admin
    .from("bookings")
    .select("id, photographer_id, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b || b.photographer_id !== me.photographer.id) {
    return Response.json({ error: "권한 없음" }, { status: 403 });
  }
  // 결제 이후(전달 준비) 또는 완료 후 교체(대처)까지 허용
  if (!["paid", "shot", "completed"].includes(b.status as string)) {
    return Response.json({ error: "전달할 수 없는 단계입니다." }, { status: 409 });
  }

  // 업로드 — 키는 uuid__표시명 (다운로드 시 __ 뒤만 파일명으로 노출)
  const buf = Buffer.from(await file.arrayBuffer());
  const path = `${bookingId}/${randomUUID()}__${safeName(file.name)}`;
  const up = await admin.storage
    .from(DELIVERY_BUCKET)
    .upload(path, buf, { contentType: file.type || "application/octet-stream" });
  if (up.error) return Response.json({ error: up.error.message }, { status: 500 });

  // deliveries.asset_paths 누적 (없으면 생성). 동시 업로드 경합은 마지막-쓰기 우선으로 단순화.
  const { data: existing } = await admin
    .from("deliveries")
    .select("asset_paths")
    .eq("booking_id", bookingId)
    .maybeSingle();
  const nextPaths = [...(existing?.asset_paths ?? []), path];
  await admin
    .from("deliveries")
    .upsert({ booking_id: bookingId, asset_paths: nextPaths }, { onConflict: "booking_id" });

  const assets = await signDeliveryAssets(nextPaths);
  return Response.json({ ok: true, assets });
}

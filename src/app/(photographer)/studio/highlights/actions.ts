"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

async function requirePhotographerId(): Promise<string> {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");
  return me.photographer.id;
}

function revalidateHighlightViews() {
  revalidatePath("/studio/highlights");
}

// 하이라이트 소유 확인
async function ownsHighlight(admin: Admin, highlightId: string, phId: string): Promise<boolean> {
  const { data } = await admin
    .from("highlights")
    .select("photographer_id")
    .eq("id", highlightId)
    .maybeSingle();
  return !!data && data.photographer_id === phId;
}

function parsePhotoIds(formData: FormData): string[] {
  return String(formData.get("photo_ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// 항목 일괄 교체 — 본인 사진만 통과시키고, 받은 순서대로 sort_order 재기록
async function replaceItems(admin: Admin, highlightId: string, phId: string, photoIds: string[]) {
  let valid = photoIds;
  if (photoIds.length > 0) {
    const { data } = await admin
      .from("photos")
      .select("id")
      .eq("photographer_id", phId)
      .in("id", photoIds);
    const ok = new Set((data ?? []).map((p) => p.id as string));
    valid = photoIds.filter((id) => ok.has(id));
  }
  await admin.from("highlight_items").delete().eq("highlight_id", highlightId);
  if (valid.length > 0) {
    await admin.from("highlight_items").insert(
      valid.map((pid, i) => ({ highlight_id: highlightId, photo_id: pid, sort_order: i }))
    );
  }
}

function coverFields(formData: FormData) {
  const coverUrl = String(formData.get("cover_url") ?? "").trim() || null;
  const coverPhotoId = String(formData.get("cover_photo_id") ?? "").trim() || null;
  const title = String(formData.get("title") ?? "").trim().slice(0, 30);
  return { coverUrl, coverPhotoId, title };
}

// 생성 — 제목·사진·커버
export async function createHighlight(formData: FormData) {
  const phId = await requirePhotographerId();
  const { coverUrl, coverPhotoId, title } = coverFields(formData);
  const photoIds = parsePhotoIds(formData);

  const admin = createAdminClient();
  const { data: last } = await admin
    .from("highlights")
    .select("sort_order")
    .eq("photographer_id", phId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort = (last?.sort_order ?? -1) + 1;

  const { data: h, error } = await admin
    .from("highlights")
    .insert({
      photographer_id: phId,
      title,
      cover_url: coverUrl,
      cover_photo_id: coverPhotoId,
      sort_order: sort,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await replaceItems(admin, h.id as string, phId, photoIds);
  revalidateHighlightViews();
}

// 수정 — 제목·사진·커버 일괄
export async function updateHighlight(formData: FormData) {
  const phId = await requirePhotographerId();
  const id = String(formData.get("id"));
  const admin = createAdminClient();
  if (!(await ownsHighlight(admin, id, phId))) throw new Error("권한이 없습니다.");

  const { coverUrl, coverPhotoId, title } = coverFields(formData);
  await admin
    .from("highlights")
    .update({ title, cover_url: coverUrl, cover_photo_id: coverPhotoId })
    .eq("id", id);
  await replaceItems(admin, id, phId, parsePhotoIds(formData));
  revalidateHighlightViews();
}

// 삭제 — 항목은 cascade
export async function deleteHighlight(formData: FormData) {
  const phId = await requirePhotographerId();
  const id = String(formData.get("id"));
  const admin = createAdminClient();
  if (!(await ownsHighlight(admin, id, phId))) throw new Error("권한이 없습니다.");
  await admin.from("highlights").delete().eq("id", id);
  revalidateHighlightViews();
}

// 하이라이트 순서 한 칸 이동
export async function reorderHighlight(formData: FormData) {
  const phId = await requirePhotographerId();
  const id = String(formData.get("id"));
  const dir = String(formData.get("dir")); // "up" | "down"
  const admin = createAdminClient();

  const { data: list } = await admin
    .from("highlights")
    .select("id")
    .eq("photographer_id", phId)
    .order("sort_order", { ascending: true });
  const arr = (list ?? []).map((h) => h.id as string);
  const idx = arr.indexOf(id);
  const swap = dir === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swap < 0 || swap >= arr.length) return;
  [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
  await Promise.all(
    arr.map((hid, i) => admin.from("highlights").update({ sort_order: i }).eq("id", hid))
  );
  revalidateHighlightViews();
}

"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { archiveAndDelete } from "@/lib/soft-delete";

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

// 항목 입력 — 포트폴리오 사진(photo_id) 또는 직접 업로드 이미지(image_url)
type ItemInput = { photo_id?: string; image_url?: string };

// 직접 업로드 이미지가 하이라이트 버킷의 것인지(타 출처 URL 주입 방지)
function isHighlightUpload(url: string): boolean {
  return /\/storage\/v1\/object\/public\/samae-highlight\//.test(url);
}

function parseItems(formData: FormData): ItemInput[] {
  try {
    const raw = JSON.parse(String(formData.get("items") ?? "[]"));
    if (!Array.isArray(raw)) return [];
    return raw
      .map((r): ItemInput => ({
        photo_id: typeof r?.photo_id === "string" ? r.photo_id : undefined,
        image_url: typeof r?.image_url === "string" ? r.image_url : undefined,
      }))
      .filter((r) => r.photo_id || (r.image_url && isHighlightUpload(r.image_url)));
  } catch {
    return [];
  }
}

// 항목 일괄 교체 — 포트폴리오 항목은 본인 사진만 통과, 업로드 항목은 하이라이트 버킷만.
// 받은 순서대로 sort_order 재기록.
async function replaceItems(admin: Admin, highlightId: string, phId: string, items: ItemInput[]) {
  const photoIds = items.map((i) => i.photo_id).filter((v): v is string => !!v);
  let okPhotos = new Set<string>();
  if (photoIds.length > 0) {
    const { data } = await admin
      .from("photos")
      .select("id")
      .eq("photographer_id", phId)
      .in("id", photoIds);
    okPhotos = new Set((data ?? []).map((p) => p.id as string));
  }

  const rows: Array<{ highlight_id: string; photo_id: string | null; image_url: string | null; sort_order: number }> = [];
  for (const it of items) {
    if (it.image_url && isHighlightUpload(it.image_url)) {
      rows.push({ highlight_id: highlightId, photo_id: null, image_url: it.image_url, sort_order: rows.length });
    } else if (it.photo_id && okPhotos.has(it.photo_id)) {
      rows.push({ highlight_id: highlightId, photo_id: it.photo_id, image_url: null, sort_order: rows.length });
    }
  }

  await admin.from("highlight_items").delete().eq("highlight_id", highlightId);
  if (rows.length > 0) {
    const { error } = await admin.from("highlight_items").insert(rows);
    if (error) throw new Error(error.message);
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
  const items = parseItems(formData);

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

  await replaceItems(admin, h.id as string, phId, items);
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
  await replaceItems(admin, id, phId, parseItems(formData));
  revalidateHighlightViews();
}

// 삭제 — 소프트딜리트(항목 + 하이라이트 아카이브 후 제거, 복구 가능)
export async function deleteHighlight(formData: FormData) {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");
  const phId = me.photographer.id;
  const id = String(formData.get("id"));
  const admin = createAdminClient();
  if (!(await ownsHighlight(admin, id, phId))) throw new Error("권한이 없습니다.");

  const r1 = await archiveAndDelete("highlight_items", { col: "highlight_id", op: "eq", val: id }, me.id);
  if (r1.error) throw new Error(r1.error);
  const r2 = await archiveAndDelete("highlights", { col: "id", op: "eq", val: id }, me.id);
  if (r2.error) throw new Error(r2.error);
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

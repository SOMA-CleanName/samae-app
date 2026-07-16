"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { archiveAndDelete } from "@/lib/soft-delete";
import {
  addPhotoToCategory,
  removePhotoFromCategory,
  addAlbumPhotosToCategory,
  removeAlbumPhotosFromCategory,
  fetchExploreCategoryGalleryPhotos,
} from "@/lib/explore-db";

export type PreviewCandidate = { id: string; thumb_url: string | null; src_url: string };

async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
}

function slugify(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40);
  return s || `cat-${Math.random().toString(36).slice(2, 8)}`;
}

// 카테고리 생성 — 새 카테고리는 목록 맨 뒤(sort = 최대+10), 비공개로 시작.
export async function createExploreCategory(formData: FormData) {
  await assertAdmin();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("이름을 입력하세요.");
  const slugInput = String(formData.get("slug") ?? "").trim();
  const slug = slugInput ? slugify(slugInput) : slugify(title);

  const admin = createAdminClient();
  const { data: last } = await admin
    .from("explore_categories")
    .select("sort")
    .order("sort", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort = ((last?.sort as number) ?? 0) + 10;

  const { error } = await admin.from("explore_categories").insert({
    title,
    slug,
    subtitle: String(formData.get("subtitle") ?? "").trim(),
    sort,
  });
  if (error) {
    if (error.code === "23505") throw new Error("이미 쓰는 slug 예요. 다른 값으로.");
    throw new Error(error.message);
  }
  revalidatePath("/admin/explore");
}

// 카테고리 수정 (이름·slug·부제)
export async function updateExploreCategory(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const admin = createAdminClient();
  const { error } = await admin
    .from("explore_categories")
    .update({
      title: String(formData.get("title") ?? "").trim(),
      slug: slugify(String(formData.get("slug") ?? "")),
      subtitle: String(formData.get("subtitle") ?? "").trim(),
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("이미 쓰는 slug 예요. 다른 값으로.");
    throw new Error(error.message);
  }
  revalidatePath("/admin/explore");
}

// 공개/비공개 토글
export async function toggleExplorePublished(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const slug = String(formData.get("slug") ?? "");
  const published = String(formData.get("published")) === "1";
  const admin = createAdminClient();
  const { error } = await admin.from("explore_categories").update({ published }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/explore");
  revalidatePath("/explore");
  if (slug) revalidatePath(`/explore/${slug}`);
}

// 카테고리 순서 이동 — 이웃과 sort 값을 맞바꾼다(상/하 버튼).
export async function moveExploreCategory(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const dir = String(formData.get("dir")); // "up" | "down"
  const admin = createAdminClient();

  const { data } = await admin
    .from("explore_categories")
    .select("id, sort")
    .order("sort", { ascending: true })
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Array<{ id: string; sort: number }>;
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return;
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= rows.length) return; // 끝단 — 이동 없음

  // sort 값 스왑. (같은 값이어도 swap 후 서로 달라지도록 인덱스 기반 재부여)
  const a = rows[i];
  const b = rows[j];
  await admin.from("explore_categories").update({ sort: b.sort }).eq("id", a.id);
  await admin.from("explore_categories").update({ sort: a.sort }).eq("id", b.id);
  revalidatePath("/admin/explore");
  revalidatePath("/explore");
}

// ── 사진→카테고리 할당(사진 단위) ──
// 사진 1장의 카테고리 소속 토글. on=true 추가 / false 제거.
export async function togglePhotoExploreCategory(
  photoId: string,
  categoryId: string,
  on: boolean
): Promise<void> {
  await assertAdmin();
  if (on) await addPhotoToCategory(photoId, categoryId);
  else await removePhotoFromCategory(photoId, categoryId);
  revalidatePath("/admin/explore/assign");
  revalidatePath("/explore");
}

// 앨범(포트폴리오) 전체를 카테고리에 일괄 추가. 추가된 사진 수 반환.
export async function addAlbumExploreCategory(
  albumId: string,
  categoryId: string
): Promise<number> {
  await assertAdmin();
  const n = await addAlbumPhotosToCategory(albumId, categoryId);
  revalidatePath("/admin/explore/assign");
  revalidatePath("/explore");
  return n;
}

// 앨범(포트폴리오) 전체를 카테고리에서 일괄 제거.
export async function removeAlbumExploreCategory(
  albumId: string,
  categoryId: string
): Promise<void> {
  await assertAdmin();
  await removeAlbumPhotosFromCategory(albumId, categoryId);
  revalidatePath("/admin/explore/assign");
  revalidatePath("/explore");
}

// ── 미리보기 사진(홈 스트립) ──
// 카테고리의 담긴 사진(멤버) 썸네일 — 미리보기 피커 후보. 펼칠 때 클라이언트가 lazy 로드.
export async function loadExploreCategoryMembers(
  categoryId: string
): Promise<PreviewCandidate[]> {
  await assertAdmin();
  const photos = await fetchExploreCategoryGalleryPhotos(categoryId);
  return photos.map((p) => ({ id: p.id, thumb_url: p.thumb_url, src_url: p.src_url }));
}

// 미리보기 사진 저장 — /explore 홈 스트립에 이 순서대로 노출.
export async function setExplorePreviewPhotos(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const slug = String(formData.get("slug") ?? "");
  const ids = [
    ...new Set(
      String(formData.get("photoIds") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];
  const admin = createAdminClient();
  const { error } = await admin
    .from("explore_categories")
    .update({ preview_photo_ids: ids })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/explore");
  revalidatePath("/explore");
  if (slug) revalidatePath(`/explore/${slug}`);
}

// 삭제 (소프트딜리트 — 아카이브 후 제거, 멤버십은 FK cascade 로 정리)
export async function deleteExploreCategory(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const id = String(formData.get("id"));
  const { error } = await archiveAndDelete(
    "explore_categories",
    { col: "id", op: "eq", val: id },
    me.id
  );
  if (error) throw new Error(error);
  revalidatePath("/admin/explore");
  revalidatePath("/explore");
}

"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { archiveAndDelete } from "@/lib/soft-delete";
import { fetchExplorePhotoPool, type PoolPhoto } from "@/lib/explore-db";

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

// 피커 풀 조회 (클라이언트에서 호출) — 태그 검색/브라우즈 다음 페이지.
export async function searchExplorePool(q: string, offset: number): Promise<PoolPhoto[]> {
  await assertAdmin();
  return fetchExplorePhotoPool(q, Math.max(0, offset));
}

// 카테고리에 담긴 사진 + 순서 저장 — 조인 테이블을 전량 교체(delete → insert position=index).
export async function setExploreCategoryPhotos(formData: FormData) {
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
  const { error: delErr } = await admin
    .from("explore_category_photos")
    .delete()
    .eq("category_id", id);
  if (delErr) throw new Error(delErr.message);
  if (ids.length > 0) {
    const rows = ids.map((photo_id, i) => ({ category_id: id, photo_id, position: i }));
    const { error: insErr } = await admin.from("explore_category_photos").insert(rows);
    if (insErr) throw new Error(insErr.message);
  }
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

"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { archiveAndDelete } from "@/lib/soft-delete";

async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
}

function parseTags(raw: string): string[] {
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
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

// 카테고리 생성
export async function createCategory(formData: FormData) {
  await assertAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("이름을 입력하세요.");
  const slugInput = String(formData.get("slug") ?? "").trim();
  const slug = slugInput ? slugify(slugInput) : slugify(name);

  const admin = createAdminClient();
  const { error } = await admin.from("categories").insert({
    name,
    slug,
    description: String(formData.get("description") ?? "").trim(),
    tags: parseTags(String(formData.get("tags") ?? "")),
  });
  if (error) {
    if (error.code === "23505") throw new Error("이미 쓰는 slug 예요. 다른 값으로.");
    throw new Error(error.message);
  }
  revalidatePath("/admin/categories");
}

// 카테고리 수정 (이름·태그·설명·slug)
export async function updateCategory(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const admin = createAdminClient();
  const { error } = await admin
    .from("categories")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      slug: slugify(String(formData.get("slug") ?? "")),
      description: String(formData.get("description") ?? "").trim(),
      tags: parseTags(String(formData.get("tags") ?? "")),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/categories");
}

// 공개/비공개 토글
export async function toggleCategoryPublished(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const published = String(formData.get("published")) === "1";
  const admin = createAdminClient();
  const { error } = await admin.from("categories").update({ published }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/categories");
}

// 삭제 (소프트딜리트 — 아카이브 후 제거)
export async function deleteCategory(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const id = String(formData.get("id"));
  const { error } = await archiveAndDelete("categories", { col: "id", op: "eq", val: id }, me.id);
  if (error) throw new Error(error);
  revalidatePath("/admin/categories");
}

"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
}

// 숨김 태그 전역 삭제 — 모든 사진의 generated_tags 에서 제거.
export async function deleteGeneratedTag(formData: FormData) {
  await assertAdmin();
  const tag = String(formData.get("tag") ?? "").trim();
  if (!tag) throw new Error("태그가 비어 있어요.");

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_delete_generated_tag", { p_tag: tag });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/tags");
}

// 숨김 태그 이름변경·병합 — from → to 로 일괄 치환(중복 제거).
export async function renameGeneratedTag(formData: FormData) {
  await assertAdmin();
  const from = String(formData.get("from") ?? "").trim();
  const to = String(formData.get("to") ?? "").trim();
  if (!from || !to) throw new Error("바꿀 이름을 확인하세요.");
  if (from === to) return;

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_rename_generated_tag", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/tags");
}

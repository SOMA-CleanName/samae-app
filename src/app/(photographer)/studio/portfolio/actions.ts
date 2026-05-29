"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

const BUCKET = "samae-portfolio";

// 사진 공개/비공개 전환 (RLS: 본인 작가 사진만)
export async function setPhotoVisibility(formData: FormData) {
  const id = String(formData.get("id"));
  const visibility = formData.get("visibility") === "published" ? "published" : "draft";
  const supabase = await createClient();
  const { error } = await supabase
    .from("photos")
    .update({ visibility })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/studio/portfolio");
}

// 사진 삭제 — Storage 원본/썸네일 + photos 행 제거. 소유권 검증 후 service_role 로 수행.
export async function deletePhoto(formData: FormData) {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");
  const id = String(formData.get("id"));

  const admin = createAdminClient();
  const { data: photo } = await admin
    .from("photos")
    .select("photographer_id, storage_path")
    .eq("id", id)
    .single();

  // 본인 작가 사진인지 확인
  if (!photo || photo.photographer_id !== me.photographer.id) {
    throw new Error("권한이 없습니다.");
  }

  // Storage 파일 제거 (원본 + 썸네일)
  const main = photo.storage_path as string;
  const thumb = main.replace(/\.jpg$/, "_thumb.jpg");
  await admin.storage.from(BUCKET).remove([main, thumb]);

  // 행 제거
  const { error } = await admin.from("photos").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/studio/portfolio");
}

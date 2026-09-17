"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { parsePurposeSelection } from "@/lib/photo-purpose";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function assertAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    throw new Error("운영자 권한이 필요합니다.");
  }
}

function assertId(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`올바르지 않은 ${label} ID입니다.`);
  }
}

export async function setAlbumPurposes(albumId: string, value: unknown): Promise<number> {
  await assertAdmin();
  assertId(albumId, "포트폴리오");
  const purposes = parsePurposeSelection(value);

  const admin = createAdminClient();
  let { data, error } = await admin.rpc("set_album_admin_purposes", {
    p_album_id: albumId,
    p_purposes: purposes,
  });
  if (error?.code === "PGRST202" && purposes.length === 1) {
    ({ data, error } = await admin.rpc("set_album_admin_purpose", { p_album_id: albumId, p_purpose: purposes[0] }));
  }
  if (error?.code === "PGRST202") throw new Error("여러 목적을 저장하려면 DB 업데이트가 필요합니다.");
  if (error) throw new Error(error.message);
  revalidatePath("/admin/photo-purpose");
  return typeof data === "number" ? data : 0;
}

export async function setPhotoPurposes(photoId: string, value: unknown): Promise<void> {
  await assertAdmin();
  assertId(photoId, "사진");
  const purposes = parsePurposeSelection(value);

  const admin = createAdminClient();
  let { error } = await admin.rpc("set_photo_admin_purposes", {
    p_photo_id: photoId,
    p_purposes: purposes,
  });
  if (error?.code === "PGRST202" && purposes.length === 1) {
    ({ error } = await admin.rpc("set_photo_admin_purpose", { p_photo_id: photoId, p_purpose: purposes[0] }));
  }
  if (error?.code === "PGRST202") throw new Error("여러 목적을 저장하려면 DB 업데이트가 필요합니다.");
  if (error) throw new Error(error.message);
  revalidatePath("/admin/photo-purpose");
}

export async function clearPhotoPurposeOverride(photoId: string): Promise<void> {
  await assertAdmin();
  assertId(photoId, "사진");

  const admin = createAdminClient();
  const { error } = await admin.rpc("clear_photo_admin_purpose_override", {
    p_photo_id: photoId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/photo-purpose");
}

export async function reviewAlbumPurpose(albumId: string): Promise<number> {
  await assertAdmin();
  assertId(albumId, "포트폴리오");

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("review_album_admin_purpose", {
    p_album_id: albumId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/photo-purpose");
  return typeof data === "number" ? data : 0;
}

export async function reviewPhotoPurpose(photoId: string): Promise<void> {
  await assertAdmin();
  assertId(photoId, "사진");

  const admin = createAdminClient();
  const { error } = await admin.rpc("review_photo_admin_purpose", {
    p_photo_id: photoId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/photo-purpose");
}

export async function setAlbumPackage(
  albumId: string,
  packageId: string | null,
): Promise<void> {
  await assertAdmin();
  assertId(albumId, "포트폴리오");
  if (packageId !== null) assertId(packageId, "패키지");

  const admin = createAdminClient();
  // RPC가 소유 작가와 기존 작가 선택을 잠금 안에서 확인한다.
  const { error } = await admin.rpc("set_album_admin_package", {
    p_album_id: albumId,
    p_package_id: packageId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/photo-purpose");
}

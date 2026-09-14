"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { isPurposeKey, type PurposeKey } from "@/lib/photo-purpose";
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

function assertPurpose(value: string): asserts value is PurposeKey {
  if (!isPurposeKey(value)) {
    throw new Error("허용되지 않은 사진 목적입니다.");
  }
}

export async function setAlbumPurpose(albumId: string, purpose: string): Promise<number> {
  await assertAdmin();
  assertId(albumId, "포트폴리오");
  assertPurpose(purpose);

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("set_album_admin_purpose", {
    p_album_id: albumId,
    p_purpose: purpose,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/photo-purpose");
  return typeof data === "number" ? data : 0;
}

export async function setPhotoPurpose(photoId: string, purpose: string): Promise<void> {
  await assertAdmin();
  assertId(photoId, "사진");
  assertPurpose(purpose);

  const admin = createAdminClient();
  const { error } = await admin.rpc("set_photo_admin_purpose", {
    p_photo_id: photoId,
    p_purpose: purpose,
  });
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
  const { data: album, error: albumError } = await admin
    .from("albums")
    .select("photographer_id")
    .eq("id", albumId)
    .maybeSingle();
  if (albumError) throw new Error(albumError.message);
  if (!album) throw new Error("포트폴리오를 찾을 수 없습니다.");

  if (packageId !== null) {
    const { data: selectedPackage, error: packageError } = await admin
      .from("packages")
      .select("photographer_id")
      .eq("id", packageId)
      .maybeSingle();
    if (packageError) throw new Error(packageError.message);
    if (!selectedPackage || selectedPackage.photographer_id !== album.photographer_id) {
      throw new Error("해당 작가의 패키지만 연결할 수 있습니다.");
    }
  }

  const { error } = await admin
    .from("albums")
    .update({ package_id: packageId })
    .eq("id", albumId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/photo-purpose");
}

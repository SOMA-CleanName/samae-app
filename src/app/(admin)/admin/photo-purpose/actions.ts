"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { genderFor, parseGenderSelection, parsePurposeSelection, type PurposeGender } from "@/lib/photo-purpose";
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

type AdminClient = ReturnType<typeof createAdminClient>;

// 성별(0132)은 목적을 저장한 **뒤에** 따로 저장한다. 목적 저장이 개인을 빼면 DB 트리거가 성별을 지우므로
// 개인이 없을 때는 부를 필요가 없다. gender 를 안 넘기면(성별 칸이 없는 DB) 건드리지 않는다.
async function saveGender(
  admin: AdminClient,
  target: { albumId: string } | { photoId: string },
  gender: PurposeGender | null,
) {
  const { error } = "albumId" in target
    ? await admin.rpc("set_album_admin_gender", { p_album_id: target.albumId, p_gender: gender })
    : await admin.rpc("set_photo_admin_gender", { p_photo_id: target.photoId, p_gender: gender });
  if (error?.code === "PGRST202") throw new Error("성별을 저장하려면 DB 업데이트(0132)가 필요합니다. 목적은 저장됐습니다.");
  if (error) throw new Error(error.message);
}

export async function setAlbumPurposes(albumId: string, value: unknown, genderValue?: unknown): Promise<number> {
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
  if (genderValue !== undefined && purposes.includes("personal")) {
    await saveGender(admin, { albumId }, genderFor(purposes, parseGenderSelection(genderValue)));
  }
  revalidatePath("/admin/photo-purpose");
  return typeof data === "number" ? data : 0;
}

export async function setPhotoPurposes(photoId: string, value: unknown, genderValue?: unknown): Promise<void> {
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
  if (genderValue !== undefined && purposes.includes("personal")) {
    await saveGender(admin, { photoId }, genderFor(purposes, parseGenderSelection(genderValue)));
  }
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

/** confirmGender — 자동 초안 성별이 있으면 검수와 함께 확정한다(같은 값을 사람이 정한 값으로). */
export async function reviewAlbumPurpose(albumId: string, confirmGender?: unknown): Promise<number> {
  await assertAdmin();
  assertId(albumId, "포트폴리오");

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("review_album_admin_purpose", {
    p_album_id: albumId,
  });
  if (error) throw new Error(error.message);
  if (confirmGender != null) await saveGender(admin, { albumId }, parseGenderSelection(confirmGender));
  revalidatePath("/admin/photo-purpose");
  return typeof data === "number" ? data : 0;
}

/** confirmGender 는 단독 사진(포트폴리오 없음)의 검수에서만 넘긴다 — 사진 성별 저장은 그 사진을 예외로 만든다. */
export async function reviewPhotoPurpose(photoId: string, confirmGender?: unknown): Promise<void> {
  await assertAdmin();
  assertId(photoId, "사진");

  const admin = createAdminClient();
  const { error } = await admin.rpc("review_photo_admin_purpose", {
    p_photo_id: photoId,
  });
  if (error) throw new Error(error.message);
  if (confirmGender != null) await saveGender(admin, { photoId }, parseGenderSelection(confirmGender));
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

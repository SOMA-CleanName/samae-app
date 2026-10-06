"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { recomputeSpotPhotos } from "@/lib/spot-photos";
import type { AdminActionKey } from "@/lib/admin-audit-labels";

// 장소별 사진(spot_photos, 0145) 어드민 액션.
//
// 운영자가 손댄 것은 자동 계산이 덮어쓰지 않는다(lib/spot-photo-sync):
//   · 빼기 — 자동 매칭을 excluded 로. 지우지 않는다(지우면 다음 계산에 되살아난다)
//   · 넣기 — manual 로. 자동 계산이 건드리지 않는다
//   · 지우기 — manual 만 지운다. 자동 매칭은 「빼기」로만 내린다

async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  return me;
}

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

function revalidateSurfaces() {
  revalidatePath("/admin/spots/photos");
  revalidatePath("/spots");
  revalidatePath("/spots/[slug]", "page");
  revalidatePath("/explore"); // 매거진 SPOTS 레일
  revalidatePath("/sitemap.xml");
}

async function audit(
  action: AdminActionKey,
  me: Awaited<ReturnType<typeof assertAdmin>>,
  spotId: string,
  photoId: string
) {
  await logAdminAction({
    action,
    actor: { id: me.id, label: me.displayName ?? null },
    target: { table: "spot_photos", id: `${spotId}:${photoId}` },
    detail: { spot_id: spotId, photo_id: photoId },
  });
}

async function setExcluded(formData: FormData, excluded: boolean) {
  const me = await assertAdmin();
  const spotId = str(formData, "spot_id");
  const photoId = str(formData, "photo_id");
  if (!spotId || !photoId) throw new Error("대상이 없습니다.");
  const { error } = await createAdminClient()
    .from("spot_photos")
    .update({ excluded, updated_by: me.id, updated_at: new Date().toISOString() })
    .eq("spot_id", spotId)
    .eq("photo_id", photoId);
  if (error) throw new Error(`저장 실패: ${error.message}`);
  await audit(excluded ? "spot_photo_exclude" : "spot_photo_include", me, spotId, photoId);
  revalidateSurfaces();
}

/** 자동으로 붙은 사진을 이 장소에서 뺀다 — 다음 자동 계산이 되살리지 않는다 */
export async function excludeSpotPhoto(formData: FormData) {
  await setExcluded(formData, true);
}

/** 뺀 사진을 되살린다 */
export async function includeSpotPhoto(formData: FormData) {
  await setExcluded(formData, false);
}

/** 사진을 장소에 직접 넣는다 — 장소 메모와 상관없이 */
export async function addSpotPhoto(formData: FormData) {
  const me = await assertAdmin();
  const spotId = str(formData, "spot_id");
  const photoId = str(formData, "photo_id");
  if (!spotId || !photoId) throw new Error("장소를 고르세요.");
  const { error } = await createAdminClient()
    .from("spot_photos")
    .upsert(
      {
        spot_id: spotId,
        photo_id: photoId,
        source: "manual",
        excluded: false,
        sort: 0,
        updated_by: me.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "spot_id,photo_id" }
    );
  if (error) throw new Error(`저장 실패: ${error.message}`);
  await audit("spot_photo_add", me, spotId, photoId);
  revalidateSurfaces();
}

/**
 * 나열형 자동 매칭(「경복궁, 창덕궁, 창경궁, 덕수궁」)을 이 장소 지면에 싣는다 — manual 로 바꾼다.
 * 자동 매칭인 채로는 지면에 안 뜬다(lib/spots). manual 이 되면 자동 계산도 건드리지 않는다.
 */
export async function promoteSpotPhoto(formData: FormData) {
  const me = await assertAdmin();
  const spotId = str(formData, "spot_id");
  const photoId = str(formData, "photo_id");
  if (!spotId || !photoId) throw new Error("대상이 없습니다.");
  const { error } = await createAdminClient()
    .from("spot_photos")
    .update({ source: "manual", excluded: false, updated_by: me.id, updated_at: new Date().toISOString() })
    .eq("spot_id", spotId)
    .eq("photo_id", photoId);
  if (error) throw new Error(`저장 실패: ${error.message}`);
  await audit("spot_photo_promote", me, spotId, photoId);
  revalidateSurfaces();
}

/** 직접 넣은 사진을 지운다 — 자동 매칭은 여기서 지우지 않는다(「빼기」를 쓴다) */
export async function removeManualSpotPhoto(formData: FormData) {
  const me = await assertAdmin();
  const spotId = str(formData, "spot_id");
  const photoId = str(formData, "photo_id");
  if (!spotId || !photoId) throw new Error("대상이 없습니다.");
  const { error } = await createAdminClient()
    .from("spot_photos")
    .delete()
    .eq("spot_id", spotId)
    .eq("photo_id", photoId)
    .eq("source", "manual");
  if (error) throw new Error(`삭제 실패: ${error.message}`);
  await audit("spot_photo_remove", me, spotId, photoId);
  revalidateSurfaces();
}

/**
 * 전체 다시 계산 — 공개 사진 전부를 다시 맞춘다(수동 전체 백필).
 * 매일 09:00 크론은 신규 사진만 더한다. 나중에 장소 메모를 단 사진 같은 예외는 이걸로 처리한다.
 */
export async function recomputeNow() {
  const me = await assertAdmin();
  const result = await recomputeSpotPhotos();
  if (!result.ok) throw new Error(`다시 계산 실패: ${String(result.error ?? "알 수 없는 오류")}`);
  await logAdminAction({
    action: "spot_photos_recompute",
    actor: { id: me.id, label: me.displayName ?? null },
    detail: result,
  });
  revalidateSurfaces();
}

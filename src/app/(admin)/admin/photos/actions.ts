"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

// 운영자 권한 확인 (방어적 — RLS/트리거 가드 외 이중 체크)
async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    throw new Error("운영자 권한이 필요합니다.");
  }
}

// 사진 피드 숨김 토글 (0074).
// 숨기면 홈·카테고리(/c/<slug>)·탐색·검색·사진 상세 하단 추천에서 빠지고,
// 사진 상세(/photos/<id>)·게시물 캐러셀·작가 포트폴리오에는 그대로 남는다.
export async function setPhotoFeedHidden(photoId: string, hidden: boolean): Promise<void> {
  await assertAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("photos")
    .update({ feed_hidden: hidden })
    .eq("id", photoId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/photos");
  revalidatePath("/");
  revalidatePath("/explore");
}

// 포트폴리오(앨범) 단위 일괄 숨김/해제 — 한 게시물을 통째로 내릴 때.
export async function setAlbumFeedHidden(albumId: string, hidden: boolean): Promise<number> {
  await assertAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("photos")
    .update({ feed_hidden: hidden })
    .eq("album_id", albumId)
    .eq("visibility", "published")
    .select("id");
  if (error) throw new Error(error.message);

  revalidatePath("/admin/photos");
  revalidatePath("/");
  revalidatePath("/explore");
  return (data ?? []).length;
}

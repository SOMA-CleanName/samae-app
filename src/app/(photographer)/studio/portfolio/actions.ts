"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

const BUCKET = "samae-portfolio";

// 피드 생성 — 같이 올린 사진들을 한 피드로 묶는다. album id 반환.
// (1장만 올려도 피드 1개. 프로필 그리드에선 대표 1장만 보이고 클릭 시 스와이프)
export async function createPost(): Promise<{ id: string }> {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("albums")
    .insert({ photographer_id: me.photographer.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

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

// 사진 메타 수정 — 가격·장소. (RLS: 본인 작가 사진만)
// 가격 노출 on/off 는 작가가 아니라 탐색 메인에서 보는 사람이 토글한다.
export async function updatePhotoMeta(formData: FormData) {
  const id = String(formData.get("id"));

  // 가격: 빈 값이면 null, 숫자면 0 이상 정수로 정규화
  const rawPrice = String(formData.get("price_krw") ?? "").trim();
  let price_krw: number | null = null;
  if (rawPrice !== "") {
    const n = Math.trunc(Number(rawPrice));
    price_krw = Number.isFinite(n) && n >= 0 ? n : null;
  }

  // 장소: 빈 문자열은 null 로
  const rawLoc = String(formData.get("location_text") ?? "").trim();
  const location_text = rawLoc === "" ? null : rawLoc.slice(0, 120);

  const supabase = await createClient();
  const { error } = await supabase
    .from("photos")
    .update({ price_krw, location_text })
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

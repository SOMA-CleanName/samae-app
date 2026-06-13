"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

const BUCKET = "samae-portfolio";

// 피드 생성 — 같이 올린 사진들을 한 피드로 묶는다. album id 반환.
// (1장만 올려도 피드 1개. 프로필 그리드에선 대표 1장만 보이고 클릭 시 스와이프)
export async function createPost(description?: string): Promise<{ id: string }> {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");
  const desc = (description ?? "").trim().slice(0, 1000) || null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("albums")
    .insert({ photographer_id: me.photographer.id, description: desc })
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

// 사진 메타 수정 — 업로드와 동일 항목(설명·가격·장소·무드·공개여부). (RLS: 본인 작가만)
// 설명은 피드(앨범) 단위, 나머지는 사진 단위.
export async function updatePhotoMeta(formData: FormData) {
  const id = String(formData.get("id"));
  const albumId = String(formData.get("album_id") ?? "").trim() || null;

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

  // 무드 태그: "a, b" csv → 배열 (비우면 [])
  const rawMoods = String(formData.get("mood_tags") ?? "").trim();
  const mood_tags = rawMoods
    ? rawMoods.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10)
    : [];

  const visibility = formData.get("visibility") === "published" ? "published" : "draft";

  const supabase = await createClient();
  const { error } = await supabase
    .from("photos")
    .update({ price_krw, location_text, mood_tags, visibility })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // 피드 설명 (앨범 단위) — 같은 피드 사진들이 공유
  if (albumId) {
    const description = String(formData.get("description") ?? "").trim().slice(0, 1000) || null;
    await supabase.from("albums").update({ description }).eq("id", albumId);
  }

  revalidatePath("/studio/portfolio");
}

// 피드(묶음) 공유 메타 수정 — 여러 사진에 가격·장소·무드·공개를 일괄 적용 + 앨범 설명.
export async function updateFeedMeta(formData: FormData) {
  const photoIds = String(formData.get("photo_ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const albumId = String(formData.get("album_id") ?? "").trim() || null;
  if (photoIds.length === 0) return;

  const rawPrice = String(formData.get("price_krw") ?? "").trim();
  let price_krw: number | null = null;
  if (rawPrice !== "") {
    const n = Math.trunc(Number(rawPrice));
    price_krw = Number.isFinite(n) && n >= 0 ? n : null;
  }
  const rawLoc = String(formData.get("location_text") ?? "").trim();
  const location_text = rawLoc === "" ? null : rawLoc.slice(0, 120);
  const rawMoods = String(formData.get("mood_tags") ?? "").trim();
  const mood_tags = rawMoods
    ? rawMoods.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10)
    : [];
  const visibility = formData.get("visibility") === "published" ? "published" : "draft";

  const supabase = await createClient();
  const { error } = await supabase
    .from("photos")
    .update({ price_krw, location_text, mood_tags, visibility })
    .in("id", photoIds);
  if (error) throw new Error(error.message);

  if (albumId) {
    const description = String(formData.get("description") ?? "").trim().slice(0, 1000) || null;
    await supabase.from("albums").update({ description }).eq("id", albumId);
  }

  revalidatePath("/studio/portfolio");
}

// 게시물(피드) 전체 공개/비공개 — 앨범의 모든 사진을 일괄 전환 (RLS: 본인 작가)
export async function setAlbumVisibility(formData: FormData) {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");
  const albumId = String(formData.get("album_id"));
  const visibility = formData.get("visibility") === "published" ? "published" : "draft";
  const supabase = await createClient();
  const { error } = await supabase
    .from("photos")
    .update({ visibility })
    .eq("album_id", albumId)
    .eq("photographer_id", me.photographer.id);
  if (error) throw new Error(error.message);
  revalidatePath("/studio/portfolio");
}

// 피드 내 사진 순서 한 칸 이동 (위/아래) — 같은 앨범 안에서만 (RLS: 본인 작가)
export async function reorderPhoto(formData: FormData) {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");
  const phId = me.photographer.id;
  const id = String(formData.get("id"));
  const dir = String(formData.get("dir")); // "up" | "down"

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("photos")
    .select("album_id")
    .eq("id", id)
    .maybeSingle();
  if (!target?.album_id) return; // 단일(앨범 없음)은 순서 개념 없음

  const { data: list } = await supabase
    .from("photos")
    .select("id")
    .eq("album_id", target.album_id)
    .eq("photographer_id", phId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  const arr = (list ?? []).map((p) => p.id as string);
  const idx = arr.indexOf(id);
  const swap = dir === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swap < 0 || swap >= arr.length) return;
  [arr[idx], arr[swap]] = [arr[swap], arr[idx]];

  // 0..n 으로 sort_order 재기록
  await Promise.all(
    arr.map((pid, i) => supabase.from("photos").update({ sort_order: i }).eq("id", pid))
  );
  revalidatePath("/studio/portfolio");
}

// 게시물(피드) 삭제 — 앨범의 모든 사진 + 앨범 제거. 소유권 검증 후 service_role.
export async function deletePost(formData: FormData) {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");
  const phId = me.photographer.id;
  const albumId = String(formData.get("album_id"));

  const admin = createAdminClient();
  const { data: photos } = await admin
    .from("photos")
    .select("id, storage_path, photographer_id")
    .eq("album_id", albumId);
  const mine = (photos ?? []).filter((p) => p.photographer_id === phId);

  if (mine.length > 0) {
    const paths = mine.flatMap((p) => {
      const main = p.storage_path as string;
      return [main, main.replace(/\.jpg$/, "_thumb.jpg")];
    });
    await admin.storage.from(BUCKET).remove(paths);
    await admin.from("photos").delete().in("id", mine.map((p) => p.id));
  }
  await admin.from("albums").delete().eq("id", albumId).eq("photographer_id", phId);
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

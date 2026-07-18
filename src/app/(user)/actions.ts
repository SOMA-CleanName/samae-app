"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mpTrackServer } from "@/lib/mixpanel-server";
import { readAnonFavPhotoIds, toggleAnonFavPhoto } from "@/lib/anon-favorites";
import { fetchPhotographerPackages } from "@/lib/discovery";

// 찜/좋아요 토글 (작가=관심 작가, 사진=좋아요). 비로그인이면 로그인으로.
export async function toggleFavorite(formData: FormData) {
  const targetType = String(formData.get("targetType"));
  const targetId = String(formData.get("targetId"));
  // 토글 후 재검증 경로 (예: /photos/abc, /photographers/abc)
  const path = String(formData.get("path") ?? "");
  // 로그인 복귀 경로 — 의도 자동수행 쿼리를 실어 보낼 수 있음(예: /photos/abc?like=1)
  const next = String(formData.get("next") ?? "");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // 비로그인 — 관심사진(photo)은 쿠키에 저장(브라우저 재방문에도 유지). 관심작가는 로그인 유도.
  if (!user) {
    if (targetType === "photo") {
      await toggleAnonFavPhoto(targetId);
      if (path) revalidatePath(path);
      revalidatePath("/favorites");
      return;
    }
    redirect(`/login?next=${encodeURIComponent(next || path || "/favorites")}`);
  }

  const { data: existing } = await supabase
    .from("favorites")
    .select("id")
    .eq("profile_id", user.id)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .maybeSingle();

  if (existing) {
    await supabase.from("favorites").delete().eq("id", existing.id);
  } else {
    await supabase
      .from("favorites")
      .insert({ profile_id: user.id, target_type: targetType, target_id: targetId });
  }

  await mpTrackServer("Toggle Favorite", user.id, {
    target_type: targetType,
    target_id: targetId,
    action: existing ? "remove" : "add",
  });

  if (path) revalidatePath(path);
  revalidatePath("/favorites");
}

// 탐색 갤러리용 사진 좋아요 토글 — 옵티미스틱 UI 전용.
// 홈(/)을 재검증하지 않아 좋아요 시 갤러리가 다시 셔플되지 않는다.
// 비로그인이면 쿠키에 저장하고 loggedIn:false 반환(로그인 시 DB로 병합됨).
export async function togglePhotoLike(
  photoId: string
): Promise<{ liked: boolean; loggedIn: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const liked = await toggleAnonFavPhoto(photoId);
    return { liked, loggedIn: false };
  }

  const { data: existing } = await supabase
    .from("favorites")
    .select("id")
    .eq("profile_id", user.id)
    .eq("target_type", "photo")
    .eq("target_id", photoId)
    .maybeSingle();

  let liked: boolean;
  if (existing) {
    await supabase.from("favorites").delete().eq("id", existing.id);
    liked = false;
  } else {
    await supabase
      .from("favorites")
      .insert({ profile_id: user.id, target_type: "photo", target_id: photoId });
    liked = true;
  }

  await mpTrackServer("Toggle Favorite", user.id, {
    target_type: "photo",
    target_id: photoId,
    action: liked ? "add" : "remove",
  });

  // 재검증 없음 — revalidatePath 는 라우터 캐시를 무효화해 현재 홈까지 새로고침/셔플시킴.
  // 찜 목록(/favorites)은 동적 페이지라 다음 방문 시 새로 로드된다.
  return { liked, loggedIn: true };
}

// 내 알림 모두 읽음 처리 (채팅 제외). 알림 센터 진입 시 호출.
export async function markNotificationsRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .neq("type", "chat")
    .is("read_at", null);
  // 사이드바 배지 갱신
  revalidatePath("/notifications");
}

// 포트폴리오 모달용 — 특정 사진의 좋아요 수 + 내 좋아요 여부 + 로그인 여부.
// (모달은 클라이언트라 서버 데이터가 필요할 때 호출)
export async function loadPhotoLike(
  photoId: string
): Promise<{ liked: boolean; count: number; loggedIn: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: countData } = await supabase.rpc("photo_like_count", { pid: photoId });
  const count = typeof countData === "number" ? countData : 0;

  let liked = false;
  if (user) {
    const { data } = await supabase
      .from("favorites")
      .select("id")
      .eq("profile_id", user.id)
      .eq("target_type", "photo")
      .eq("target_id", photoId)
      .maybeSingle();
    liked = !!data;
  } else {
    // 비로그인 — 쿠키에 저장된 관심사진이면 좋아요 상태
    liked = (await readAnonFavPhotoIds()).includes(photoId);
  }
  return { liked, count, loggedIn: !!user };
}

// 담은 사진 확대뷰 메타 — 가격·위치 + 가격에 가장 가까운 활성 패키지의 촬영시간·보정본.
// (카트 아이템엔 가격/패키지가 없어 확대 시 서버에서 조회. 사진 상세와 동일한 최근접 매칭)
export async function loadCartPhotoMeta(photoId: string): Promise<{
  priceKrw: number | null;
  location: string | null;
  durationMin: number | null;
  editedCount: number | null;
} | null> {
  const supabase = await createClient();
  const { data: photo } = await supabase
    .from("photos")
    .select("id, price_krw, region, location_text, photographer_id")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return null;

  const priceKrw = (photo.price_krw as number | null) ?? null;
  const location = (photo.location_text as string | null) || (photo.region as string | null) || null;

  let durationMin: number | null = null;
  let editedCount: number | null = null;
  if (priceKrw != null) {
    const packages = await fetchPhotographerPackages(photo.photographer_id as string);
    if (packages.length > 0) {
      const nearest = packages.reduce((best, p) =>
        Math.abs(p.price_krw - priceKrw) < Math.abs(best.price_krw - priceKrw) ? p : best
      );
      durationMin = nearest.duration_min;
      editedCount = nearest.edited_count;
    }
  }
  return { priceKrw, location, durationMin, editedCount };
}

// (추천 피드는 discovery.fetchSimilarPhotos 로 이전 — 태그 유사도순 풀을 서버에서 한 번에 제공)

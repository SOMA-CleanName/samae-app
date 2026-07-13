import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  fetchPhotographersByIds,
  fetchMyLikedPhotos,
  fetchLikedPhotosByIds,
} from "@/lib/discovery";
import { readAnonFavPhotoIds } from "@/lib/anon-favorites";
import { FavoritesTabs } from "./FavoritesTabs";
import { MpTrackOnce } from "@/components/MpTrackOnce";

export const dynamic = "force-dynamic";

// 찜 화면 — 좋아요한 사진 / 관심 작가 2탭.
// 비로그인도 접근 가능: 쿠키에 저장된 관심사진을 보여준다(관심 작가는 로그인 필요).
export default async function FavoritesPage() {
  const me = await getCurrentUser();

  // 비로그인 — 쿠키의 관심사진만 표시
  if (!me) {
    const likedPhotos = await fetchLikedPhotosByIds(await readAnonFavPhotoIds());
    return (
      <main className="mx-auto max-w-6xl px-3.5 sm:px-5 py-8 font-kr">
        <MpTrackOnce
          event="View Favorites"
          props={{ liked_photo_count: likedPhotos.length, saved_photographer_count: 0, anon: true }}
        />
        <h1 className="text-2xl font-semibold">보관함</h1>
        <FavoritesTabs likedPhotos={likedPhotos} photographers={[]} loggedIn={false} />
      </main>
    );
  }

  const supabase = await createClient();

  // 관심 작가 id (favorites.target_type='photographer')
  const { data: favs } = await supabase
    .from("favorites")
    .select("target_id")
    .eq("profile_id", me.id)
    .eq("target_type", "photographer")
    .order("created_at", { ascending: false });
  const phIds = (favs ?? []).map((f) => f.target_id as string);

  // 좋아요한 사진 + 관심 작가 병렬 조회
  const [likedPhotos, photographers] = await Promise.all([
    fetchMyLikedPhotos(me.id),
    fetchPhotographersByIds(phIds),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-3.5 sm:px-5 py-8 font-kr">
      {/* 보관함 진입 — 리텐션·관심 강도 신호 */}
      <MpTrackOnce
        event="View Favorites"
        props={{ liked_photo_count: likedPhotos.length, saved_photographer_count: photographers.length }}
      />
      <h1 className="text-2xl font-semibold">보관함</h1>
      <FavoritesTabs likedPhotos={likedPhotos} photographers={photographers} loggedIn />
    </main>
  );
}

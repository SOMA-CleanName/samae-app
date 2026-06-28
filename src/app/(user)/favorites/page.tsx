import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchPhotographersByIds, fetchMyLikedPhotos } from "@/lib/discovery";
import { FavoritesTabs } from "./FavoritesTabs";

export const dynamic = "force-dynamic";

// 찜 화면 — 좋아요한 사진 / 관심 작가 2탭
export default async function FavoritesPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/favorites");

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
      <h1 className="text-2xl font-semibold">보관함</h1>
      <FavoritesTabs likedPhotos={likedPhotos} photographers={photographers} />
    </main>
  );
}

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { EXPLORE_CATEGORIES } from "@/lib/explore-categories";
import { seededShuffle, spaceByKey, dayKey } from "@/lib/seeded-shuffle";
import { ExploreGallery } from "@/components/user/ExploreGallery";
import { ScrollMemory } from "@/components/user/ScrollMemory";
import { MpTrackOnce } from "@/components/MpTrackOnce";
import type { GalleryPhoto } from "@/lib/discovery";

export const dynamic = "force-dynamic";

type Row = GalleryPhoto & { album_id: string | null };

// 탐색 세분 카테고리 진입 — 미리보기와 같은 시드 순서로 전체를 메이슨리 노출.
export default async function ExploreCategoryPage({
  params,
}: {
  params: Promise<{ idx: string }>;
}) {
  const { idx } = await params;
  const cat = EXPLORE_CATEGORIES[Number(idx)];
  if (!cat) notFound();

  const [me, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const { data } = await supabase
    .from("photos")
    .select(
      "id, src_url, thumb_url, width, height, region, mood_tags, price_krw, album_id, photographer:photographers!photos_photographer_id_fkey!inner(id, display_name)"
    )
    .eq("visibility", "published")
    .overlaps("mood_tags", cat.tags)
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = (data ?? []) as unknown as Row[];
  const seed = dayKey();
  const ordered = spaceByKey(
    seededShuffle(rows, `${seed}:${cat.name}`),
    (p) => p.album_id ?? `s:${p.id}`
  );

  return (
    <section className="px-2.5 pb-2.5 pt-2.5 font-kr sm:px-4 sm:pt-4 sm:pb-4">
      <ScrollMemory />
      {/* 카테고리 탐색 진입 — 취향 시그널(수요 차원) */}
      <MpTrackOnce event="View Category" props={{ category: cat.name, result_count: ordered.length }} />
      <h1 className="mb-3 px-1 text-xl font-bold tracking-tight">{cat.name}</h1>
      <ExploreGallery photos={ordered} loggedIn={!!me} />
    </section>
  );
}

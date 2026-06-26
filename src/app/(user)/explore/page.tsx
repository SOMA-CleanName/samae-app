/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EXPLORE_CATEGORIES } from "@/lib/explore-categories";
import { ChevronRightIcon } from "@/components/user/icons";

export const dynamic = "force-dynamic";

type Row = { id: string; src_url: string; thumb_url: string | null; mood_tags: string[] | null };

// 탐색 페이지 — 세분 카테고리별 가로 미리보기 섹션(별개 체계, explore-categories).
// 전체 공개 사진을 1회 조회해 JS로 버킷(쿼리 1회). 섹션 더보기 → /?q=<대표태그>.
export default async function ExplorePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select(
      "id, src_url, thumb_url, mood_tags, photographer:photographers!photos_photographer_id_fkey!inner(id)"
    )
    .eq("visibility", "published")
    .order("created_at", { ascending: false })
    .limit(1000);

  const rows = (data ?? []) as unknown as Row[];

  const sections = EXPLORE_CATEGORIES.map((c) => {
    const set = new Set(c.tags.map((t) => t.toLowerCase()));
    const photos = rows
      .filter((p) => (p.mood_tags ?? []).some((t) => set.has(t.toLowerCase())))
      .slice(0, 14);
    return { c, photos };
  }).filter((s) => s.photos.length > 0);

  return (
    <section className="font-kr">
      <div className="space-y-7 px-4 pb-4 pt-5 sm:px-5">
        <h1 className="text-xl font-bold tracking-tight">탐색</h1>
        {sections.map(({ c, photos }) => (
          <div key={c.name}>
            <Link
              href={`/?q=${encodeURIComponent(c.tags[0])}`}
              className="mb-2.5 flex items-center justify-between gap-2"
            >
              <h2 className="text-lg font-semibold tracking-tight">{c.name}</h2>
              <span className="flex items-center gap-0.5 text-sm font-medium text-muted">
                더보기 <ChevronRightIcon className="h-4 w-4" />
              </span>
            </Link>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-5 sm:px-5 [&::-webkit-scrollbar]:hidden">
              {photos.map((p) => (
                <Link
                  key={p.id}
                  href={`/photos/${p.id}`}
                  className="block shrink-0 overflow-hidden rounded-xl bg-fg/[0.05]"
                >
                  <img
                    src={p.thumb_url ?? p.src_url}
                    alt=""
                    loading="lazy"
                    className="h-44 w-32 object-cover"
                  />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

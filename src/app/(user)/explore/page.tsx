/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EXPLORE_CATEGORIES } from "@/lib/explore-categories";
import { seededShuffle, spaceByKey, dayKey } from "@/lib/seeded-shuffle";
import { ChevronRightIcon } from "@/components/user/icons";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  src_url: string;
  thumb_url: string | null;
  mood_tags: string[] | null;
  album_id: string | null;
};

// 탐색 페이지 — 세분 카테고리별 가로 미리보기 섹션(별개 체계).
// 섹션 전체(이름·더보기·사진) 클릭 → 해당 카테고리 탐색 페이지(/explore/[idx]).
// 순서: 시드(오늘) 셔플 + 같은 게시물 연속 방지. 진입 페이지와 같은 시드라 순서 일치.
export default async function ExplorePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select(
      "id, src_url, thumb_url, mood_tags, album_id, photographer:photographers!photos_photographer_id_fkey!inner(id)"
    )
    .eq("visibility", "published")
    .order("created_at", { ascending: false })
    .limit(1000);

  const rows = (data ?? []) as unknown as Row[];
  const seed = dayKey();

  const sections = EXPLORE_CATEGORIES.map((c, idx) => {
    const set = new Set(c.tags.map((t) => t.toLowerCase()));
    const matched = rows.filter((p) => (p.mood_tags ?? []).some((t) => set.has(t.toLowerCase())));
    const ordered = spaceByKey(seededShuffle(matched, `${seed}:${c.name}`), (p) => p.album_id ?? `s:${p.id}`);
    return { c, idx, photos: ordered.slice(0, 14) };
  }).filter((s) => s.photos.length > 0);

  return (
    <section className="font-kr">
      <div className="space-y-7 px-4 pb-4 pt-5 sm:px-5">
        <h1 className="text-xl font-bold tracking-tight">탐색</h1>
        {sections.map(({ c, idx, photos }) => (
          <Link key={c.name} href={`/explore/${idx}`} className="block">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{c.name}</h2>
              <span className="flex items-center gap-0.5 text-sm font-medium text-muted">
                더보기 <ChevronRightIcon className="h-4 w-4" />
              </span>
            </div>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-5 sm:px-5 [&::-webkit-scrollbar]:hidden">
              {photos.map((p) => (
                <div
                  key={p.id}
                  className="block shrink-0 overflow-hidden rounded-xl bg-fg/[0.05]"
                >
                  <img
                    src={p.thumb_url ?? p.src_url}
                    alt=""
                    loading="lazy"
                    className="h-44 w-32 object-cover"
                  />
                </div>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

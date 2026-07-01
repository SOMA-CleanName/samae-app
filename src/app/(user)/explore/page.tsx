import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EXPLORE_CATEGORIES } from "@/lib/explore-categories";
import { seededShuffle, spaceByKey, dayKey } from "@/lib/seeded-shuffle";
import { ChevronRightIcon } from "@/components/user/icons";
import { ExploreStrip } from "./ExploreStrip";
import { ScrollMemory } from "@/components/user/ScrollMemory";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  src_url: string;
  thumb_url: string | null;
  width: number;
  height: number;
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
      "id, src_url, thumb_url, width, height, mood_tags, album_id, photographer:photographers!photos_photographer_id_fkey!inner(id)"
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
    // 저스티파이드 행이 폭에 따라 필요한 만큼 골라 쓰도록 넉넉히 후보를 넘긴다(모바일~PC).
    return { c, idx, photos: ordered.slice(0, 10) };
  }).filter((s) => s.photos.length >= 4);

  return (
    <section className="font-kr">
      <ScrollMemory />
      <div className="space-y-7 px-2.5 pb-2.5 pt-2.5 sm:px-4 sm:pt-4 sm:pb-4">
        <h1 className="text-xl font-bold tracking-tight">탐색</h1>
        {sections.map(({ c, idx, photos }) => (
          <Link key={c.name} href={`/explore/${idx}`} className="group block">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{c.name}</h2>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fg/[0.06] text-muted transition-colors group-hover:bg-fg/10 group-hover:text-fg">
                <ChevronRightIcon className="h-4 w-4" />
              </span>
            </div>
            {/* 저스티파이드 행 — 사진 원본 비율 그대로(안 잘림), 한 줄 폭 꽉 채움 */}
            <ExploreStrip photos={photos} />
          </Link>
        ))}
      </div>
    </section>
  );
}

"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TASTE_COOKIE } from "@/lib/category-constants";

export type CuratedPhoto = { id: string; url: string };

// 취향 태그를 쿠키에 저장 — 홈 피드가 이걸 읽어 취향순으로 랭킹한다. (익명 포함, 30일)
export async function saveTaste(tags: string[]): Promise<void> {
  const clean = [...new Set(tags.filter(Boolean))].slice(0, 6);
  const store = await cookies();
  if (clean.length === 0) {
    store.delete(TASTE_COOKIE);
    return;
  }
  store.set(TASTE_COOKIE, clean.join(","), {
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
  });
}

// 취향 초기화 — 쿠키 삭제 후 홈 재검증.
export async function clearTaste(): Promise<void> {
  (await cookies()).delete(TASTE_COOKIE);
  revalidatePath("/");
}

// 취향 태그로 맞춤 스냅 큐레이션 — mood_tags 가 고른 태그와 겹치는 공개 사진을,
// 겹치는 태그 수(점수)로 랭크하고 게시물(앨범)당 1장으로 추려 반환.
export async function curateByTaste(tags: string[]): Promise<CuratedPhoto[]> {
  const clean = [...new Set(tags.filter(Boolean))].slice(0, 6);
  if (clean.length === 0) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select(
      "id, src_url, thumb_url, album_id, mood_tags, photographer:photographers!photos_photographer_id_fkey!inner(id)"
    )
    .eq("visibility", "published")
    .overlaps("mood_tags", clean)
    .limit(200);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    src_url: string;
    thumb_url: string | null;
    album_id: string | null;
    mood_tags: string[] | null;
  }>;

  // 게시물(앨범)당 최고점 1장 — 점수 = 겹치는 태그 수
  const byAlbum = new Map<string, { id: string; url: string; score: number }>();
  for (const p of rows) {
    const score = (p.mood_tags ?? []).filter((t) => clean.includes(t)).length;
    const key = p.album_id ?? `photo:${p.id}`;
    const cur = byAlbum.get(key);
    if (!cur || score > cur.score) {
      byAlbum.set(key, { id: p.id, url: p.thumb_url ?? p.src_url, score });
    }
  }

  return [...byAlbum.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ id, url }) => ({ id, url }));
}

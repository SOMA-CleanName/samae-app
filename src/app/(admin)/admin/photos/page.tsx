import { createAdminClient } from "@/lib/supabase/admin";
import { PhotoVisibilityGrid, type AdminPhoto } from "./PhotoVisibilityGrid";

export const dynamic = "force-dynamic";

// 사진 노출 관리 — 운영자가 기본 추천 우선순위를 낮출 사진을 고른다. (0075 feed_hidden)
//  유지 → 사진 상세(/photos/<id>) · 게시물 캐러셀 · 작가 포트폴리오 · 사이트맵
type Row = {
  id: string;
  thumb_url: string | null;
  src_url: string;
  album_id: string | null;
  feed_hidden: boolean;
  album: { title: string | null } | null;
  photographer: { display_name: string | null } | null;
};

async function fetchPhotos(): Promise<AdminPhoto[]> {
  const admin = createAdminClient();
  const PAGE = 1000;
  const out: AdminPhoto[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await admin
      .from("photos")
      .select(
        "id, thumb_url, src_url, album_id, feed_hidden, album:albums(title), photographer:photographers!photos_photographer_id_fkey(display_name)"
      )
      .eq("visibility", "published")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    const batch = ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      thumb_url: r.thumb_url,
      src_url: r.src_url,
      albumId: r.album_id,
      albumTitle: r.album?.title ?? null,
      photographer: r.photographer?.display_name ?? null,
      hidden: !!r.feed_hidden,
    }));
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

export default async function AdminPhotosPage() {
  const photos = await fetchPhotos();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">사진 노출 낮춤</h1>
      <p className="mt-1 text-body-sm text-muted">
        기본 추천 우선순위를 낮출 사진을 고르세요. 홈에서는 일반 사진 뒤에 나오며, 같은 스타일을
        반복해서 고른 사용자에게는 유사도에 따라 다시 위로 올라올 수 있어요. 검색과 편집형 탐색에서는
        계속 제외됩니다.
      </p>

      <PhotoVisibilityGrid photos={photos} />
    </main>
  );
}

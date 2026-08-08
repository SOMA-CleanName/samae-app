import { createAdminClient } from "@/lib/supabase/admin";
import { PhotoVisibilityGrid, type AdminPhoto } from "./PhotoVisibilityGrid";

export const dynamic = "force-dynamic";

// 사진 노출 관리 — 운영자가 '둘러보기 면에 안 띄울 사진'을 고른다. (0074 feed_hidden)
//  숨김 → 홈 · /c/<slug> 카테고리 · 탐색 · 검색 · 사진 상세 하단 추천에서 제외
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
      <h1 className="text-h1 font-semibold">사진 노출</h1>
      <p className="mt-1 text-body-sm text-muted">
        둘러보기 면에 띄우지 않을 사진을 고르세요. 숨기면 <b className="text-fg">홈 · 카테고리 · 탐색
        · 검색 · 사진 상세 하단 추천</b>에서 빠집니다. 사진 상세 페이지와 작가 포트폴리오에는 그대로
        남아요(링크를 받은 사람은 볼 수 있어요).
      </p>

      <PhotoVisibilityGrid photos={photos} />
    </main>
  );
}

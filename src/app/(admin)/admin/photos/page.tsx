import { createAdminClient } from "@/lib/supabase/admin";
import { PhotoVisibilityGrid, type AdminPhoto } from "./PhotoVisibilityGrid";

export const dynamic = "force-dynamic";

/*
  사진 노출 관리 — 운영자가 내릴 사진을 고른다. (0075 feed_hidden)

  ⚠️ **2026-09-17 에 범위가 넓어졌다.** 원래는 "기본 추천 우선순위를 낮춘다" 였고
     사이트맵에는 그대로 실었는데, 크롤이 풀리면서 **내린 사진이 구글 검색에 뜨기
     시작했다.** 피드에서 내린 의미가 없어져서 검색에서도 빼기로 했다.

    빠짐 → 피드 · 탐색 · 카테고리 · 검색 · 추천 · 광고 진입 · 작가 카드 대표사진
           · **사이트맵** · **검색엔진 색인**(사진 상세가 noindex 를 내보낸다)
    유지 → 사진 상세(/photos/<id>) 지면 자체 · 게시물 캐러셀 · 작가 포트폴리오

  즉 **"찾아지지는 않지만 직접 링크로는 열린다."** 완전히 없애려면 이게 아니라
  visibility 를 내려야 한다(작가를 내보내는 경우는 0126 의 suspend_photographer_content).
*/
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
      <h1 className="text-h1 font-semibold">사진 내리기</h1>
      {/* ⚠️ 이 문구는 **실제 동작과 맞아야 한다.** 전에는 "추천 우선순위를 낮춘다 ·
          유사도에 따라 다시 위로 올라올 수 있다" 라고 적혀 있었는데, 그건 2026-09-17
          이전의 강등 규칙이다. 지금은 검색엔진 색인에서도 빠진다 — 운영자가 "잠깐
          뒤로 미루는 것" 으로 알고 누르면 구글에서 사진이 사라진다. */}
      <p className="mt-1 text-body-sm leading-relaxed text-muted">
        고른 사진은 <b className="font-semibold text-fg">찾아지지 않게</b> 돼요. 피드·탐색·카테고리·검색·추천·광고
        진입과 작가 카드 대표사진에서 빠지고, <b className="font-semibold text-fg">사이트맵과 검색엔진 색인에서도
        빠져요</b>(사진 상세가 noindex 를 내보냄).
      </p>
      <p className="mt-1.5 text-caption leading-relaxed text-faint">
        다만 <b className="font-medium text-muted">직접 링크로는 계속 열려요</b> — 사진 상세 지면 자체, 게시물
        캐러셀, 작가 포트폴리오에는 남아요. 완전히 없애려면 여기가 아니라 사진의 공개 설정을 내려야 해요.
      </p>

      <PhotoVisibilityGrid photos={photos} />
    </main>
  );
}

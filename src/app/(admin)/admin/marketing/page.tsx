import { createAdminClient } from "@/lib/supabase/admin";
import { MarketingPhotoBrowser } from "./MarketingPhotoBrowser";
import type { MarketingPhoto } from "@/lib/marketing-photos";

export const dynamic = "force-dynamic";

/*
  마케팅 사용 가능 사진 — 광고·SNS 에 써도 되는 사진을 골라 보는 지면.

  왜 따로 만들었나: 동의는 **앨범 단위**인데 기존 화면은 전부 사진 그리드였다.
  「사진 내리기」는 1,800장을 필터 없이 쏟아내고, 「타겟 카테고리」는 그 카테고리
  안에서만 동의 여부를 보여준다. "이 작가 사진 중 쓸 수 있는 게 뭐냐" 를 물을 자리가
  없어서, 쓸 때마다 앨범을 하나씩 열어 확인해야 했다.

  판정 규칙은 lib/marketing-photos 한 곳에 있다 — 화면마다 다르게 판단하면
  그 어긋남이 실제로 밖에 나가는 사진을 고른다.
*/

type Row = {
  id: string;
  thumb_url: string | null;
  src_url: string;
  visibility: string;
  feed_hidden: boolean;
  album_id: string | null;
  admin_purpose: string | null;
  mood_tags: string[] | null;
  auto_mood_tags: string[] | null;
  photographer_id: string;
  album: { title: string | null; ad_consent: boolean } | null;
  photographer: { display_name: string | null } | null;
};

async function fetchAll(): Promise<MarketingPhoto[]> {
  const admin = createAdminClient();
  const PAGE = 1000; // PostgREST 기본 상한 — 넘는 만큼 range 로 이어 받는다
  const out: MarketingPhoto[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await admin
      .from("photos")
      .select(
        "id, thumb_url, src_url, visibility, feed_hidden, album_id, admin_purpose, mood_tags, auto_mood_tags, photographer_id, " +
          "album:albums(title, ad_consent), photographer:photographers!photos_photographer_id_fkey(display_name)"
      )
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    const batch = ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      thumbUrl: r.thumb_url,
      srcUrl: r.src_url,
      photographerId: r.photographer_id,
      photographerName: r.photographer?.display_name ?? "(이름 없음)",
      albumId: r.album_id,
      albumTitle: r.album?.title ?? null,
      // 앨범이 없으면 동의를 받은 적이 없는 것이다 — 없음으로 본다
      albumAdConsent: !!r.album?.ad_consent,
      visibility: r.visibility,
      feedHidden: !!r.feed_hidden,
      purpose: r.admin_purpose,
      moodTags: r.mood_tags ?? [],
      autoMoodTags: r.auto_mood_tags ?? [],
    }));
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

export default async function AdminMarketingPhotosPage() {
  const photos = await fetchAll();
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">마케팅 사용 가능 사진</h1>
      <p className="mt-1 text-body-sm leading-relaxed text-muted">
        광고·SNS 에 써도 되는 사진만 골라 봐요. 기준은{" "}
        <b className="font-semibold text-fg">포트폴리오(앨범) 단위 광고 소재 사용 동의</b> 하나예요 —
        작가가 사진을 올릴 때 묶음마다 체크하는 값이고, 선택 항목이라 안 한 묶음이 있어요.
      </p>
      {/* 없는 보증을 있는 것처럼 보이면 그게 더 위험하다 — 한계를 지면에 적어 둔다 */}
      <p className="mt-1.5 text-caption leading-relaxed text-faint">
        ⚠️ 여기서 <b className="font-medium text-muted">피사체(회원)의 초상 사용 거부는 아직 못 봐요.</b>{" "}
        거부는 예약 단위로 기록되는데 사진이 예약을 참조하지 않아 이어 붙일 수가 없어요. 인물이 크게
        나온 사진을 쓸 때는 작가에게 한 번 더 확인해주세요.
      </p>

      <MarketingPhotoBrowser photos={photos} />
    </main>
  );
}

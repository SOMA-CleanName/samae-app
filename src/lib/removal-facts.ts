import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { listPublishedSpots } from "@/lib/spots-db";
import { countSpotPhotos, countSpotPhotosExcluding } from "@/lib/spots";
import { SPOT_MIN_PHOTOS, type RemovalFacts } from "@/lib/removal-report";

/**
 * 작가 퇴출 점검에 필요한 숫자를 모은다. 판정은 removal-report.ts 가 한다.
 *
 * 전부 **service_role** 로 센다. 지우기 전에 "무엇이 걸려 있나" 를 묻는 자리인데
 * RLS 로 일부만 보이면 **안 보이는 것을 없는 것으로 세게 된다.**
 *
 * 사진을 참조하는 방식이 네 가지고 각각 다르게 확인해야 한다:
 *   FK CASCADE   — 알아서 지워진다. 숫자만
 *   FK SET NULL  — 표지가 조용히 빈다 (highlights)
 *   URL 문자열   — FK 가 없어 **행으로는 못 찾는다.** 파일명으로 대조한다 (articles·banners)
 *   location 매칭 — 스팟. 매칭 규칙을 다시 적지 않고 lib/spots 를 부른다
 */

/** 닫히지 않은 문의로 볼 상태. expired 만 끝난 것으로 본다 — 환불 분쟁은 당연히 열린 것 */
/** 포트폴리오 사진이 사는 버킷 (api/portfolio/upload 와 같은 값) */
export const PORTFOLIO_BUCKET = "samae-portfolio";

const OPEN_INQUIRY = ["accepted", "confirmed", "refund_requested"];

/** CASCADE 로 따라 지워지는 표 — 숫자만 세어 보여준다 */
const CASCADE_TABLES = [
  "photos",
  "packages",
  "albums",
  "about_sections",
  "availability",
  "availability_blocks",
  "availability_rules",
  "highlights",
  "payout_accounts",
  "photographer_agreements",
  "photographer_guide_images",
  "reviews",
];

/** URL 에서 파일명만 — 버킷·도메인이 달라도 같은 파일을 찾을 수 있게 */
function fileName(url: string | null | undefined): string | null {
  if (!url) return null;
  const last = String(url).split("?")[0].split("/").pop();
  return last && last.length > 8 ? last : null;
}

export async function fetchRemovalFacts(photographerId: string): Promise<RemovalFacts> {
  const admin = createAdminClient();
  const count = async (table: string, col = "photographer_id") => {
    const { count: n, error } = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(col, photographerId);
    // 없는 표(settlements 등)는 0 으로. 여기서 던지면 점검 화면이 통째로 안 뜬다
    return error ? 0 : (n ?? 0);
  };

  const [bookings, platformFees, settlements] = await Promise.all([
    count("bookings"),
    count("platform_fees"),
    count("settlements"),
  ]);

  // conversations 에는 status 가 없다. 고객이 안 치운 방을 '열려 있다' 로 본다 —
  // 답을 기다리는 사람이 있는 방이 예고 없이 사라지는 걸 막는 게 목적이다.
  const { count: openConversations } = await admin
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("photographer_id", photographerId)
    .is("user_hidden_at", null);

  const { count: openInquiries } = await admin
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .eq("photographer_id", photographerId)
    .in("status", OPEN_INQUIRY);

  // ── 이 작가 사진 목록 (URL 대조·Storage 정리·하이라이트 표지에 쓰인다) ──
  const { data: photoRows } = await admin
    .from("photos")
    .select("id, src_url, thumb_url")
    .eq("photographer_id", photographerId);
  const photos = (photoRows ?? []) as Array<{ id: string; src_url: string; thumb_url: string | null }>;
  const photoIds = new Set(photos.map((p) => p.id));
  const names = new Set(
    photos.flatMap((p) => [fileName(p.src_url), fileName(p.thumb_url)]).filter(Boolean) as string[]
  );
  const usesOurPhoto = (...urls: Array<string | null | undefined>) =>
    urls.some((u) => {
      const n = fileName(u);
      return !!n && names.has(n);
    });

  // 아티클·배너 — FK 가 없어 **전부 받아서 파일명으로 대조**한다. 둘 다 수십 개 규모라
  // 전량 조회가 문제되지 않는다(수천 개가 되면 그때 인덱스를 고민한다).
  const { data: articleRows } = await admin
    .from("articles")
    .select("title, cover_url, published");
  const articles = ((articleRows ?? []) as Array<{ title: string; cover_url: string | null; published: boolean }>)
    .filter((a) => usesOurPhoto(a.cover_url))
    .map((a) => ({ title: a.title, published: a.published }));

  const { data: bannerRows } = await admin
    .from("home_banners")
    .select("title, image_url, thumb_url, published");
  const banners = ((bannerRows ?? []) as Array<{ title: string; image_url: string | null; thumb_url: string | null; published: boolean }>)
    .filter((b) => usesOurPhoto(b.image_url, b.thumb_url))
    .map((b) => ({ title: b.title, published: b.published }));

  // 표지가 이 작가 사진인 하이라이트 — 다른 작가 것도 있을 수 있어 전체를 훑는다
  const { data: hlRows } = await admin.from("highlights").select("cover_photo_id");
  const highlightCovers = ((hlRows ?? []) as Array<{ cover_photo_id: string | null }>).filter(
    (h) => h.cover_photo_id && photoIds.has(h.cover_photo_id)
  ).length;

  // ── 스팟 ──
  const spots = await listPublishedSpots();
  const spotsGoingDark: RemovalFacts["spotsGoingDark"] = [];
  for (const spot of spots) {
    const before = await countSpotPhotos(spot);
    // 지금 이미 기준 미달인 곳은 이번 퇴출 탓이 아니다 — 여기 섞으면 원인이 흐려진다
    if (before < SPOT_MIN_PHOTOS) continue;
    const after = await countSpotPhotosExcluding(spot, photographerId);
    if (after < SPOT_MIN_PHOTOS) spotsGoingDark.push({ slug: spot.slug, before, after });
  }

  const cascadeCounts = await Promise.all(CASCADE_TABLES.map((t) => count(t)));

  return {
    bookings,
    platformFees,
    settlements,
    openConversations: openConversations ?? 0,
    openInquiries: openInquiries ?? 0,
    articles,
    banners,
    highlightCovers,
    spotsGoingDark,
    storageFiles: names.size,
    cascadeRows: cascadeCounts.reduce((a, b) => a + b, 0),
    // 대장이 아직 없다. **0 이 아니라 '모름'** 으로 넘긴다 (removal-report 참고)
    marketingLedger: { available: false },
  };
}

/**
 * Storage 에서 지울 경로 — **DB 삭제 전에** 모아 둬야 한다. 지우고 나면 알 방법이 없다.
 *
 * 두 군데서 모은다.
 *   ① `photos` 행의 URL
 *   ② **작가 폴더 목록** — ①만으로는 모자란다
 *
 * ⚠️ ② 가 왜 필요한지는 실측으로 알았다(2026-09-22, 히히픽 퇴출). `photos` 기준으로는
 *    154개였는데 폴더에는 **156개**가 있었다. 업로드는 끝났는데 DB 행이 안 만들어진
 *    파일 두 개가 석 달째 남아 있었다. ① 만 쓰면 그런 파일은 **영영 안 지워진다** —
 *    작가가 사라지고 나면 그 폴더를 들여다볼 이유가 없어지기 때문이다.
 */
export async function collectStoragePaths(photographerId: string): Promise<string[]> {
  const admin = createAdminClient();
  const paths = new Set<string>();

  const { data } = await admin
    .from("photos")
    .select("src_url, thumb_url")
    .eq("photographer_id", photographerId);
  for (const p of (data ?? []) as Array<{ src_url: string; thumb_url: string | null }>) {
    for (const url of [p.src_url, p.thumb_url]) {
      // 공개 URL 에서 버킷 뒤 경로만 떼어낸다
      const m = url?.match(/\/object\/public\/[^/]+\/(.+)$/);
      if (m) paths.add(decodeURIComponent(m[1].split("?")[0]));
    }
  }

  // 작가 폴더에 실제로 뭐가 있는지. 업로드 경로가 `<작가id>/<파일>` 규약이라 그대로 쓴다.
  const { data: listed } = await admin.storage
    .from(PORTFOLIO_BUCKET)
    .list(photographerId, { limit: 1000 });
  for (const f of (listed ?? []) as Array<{ name: string }>) {
    paths.add(`${photographerId}/${f.name}`);
  }

  return [...paths];
}

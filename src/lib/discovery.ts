import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { seededShuffle } from "@/lib/seeded-shuffle";
import { readAnonFavPhotoIds } from "@/lib/anon-favorites";
import { attachRecommendationDebug, mapSimilarityRows, mergeDemotedSimilar, promotionStage, type RecommendationDebug } from "@/lib/feed-demotion";

// 탐색 갤러리 사진 1장
export type GalleryPhoto = {
  id: string;
  src_url: string;
  thumb_url: string | null;
  width: number;
  height: number;
  region: string | null;
  mood_tags: string[];
  price_krw: number | null;
  photographer: { id: string; display_name: string | null };
  recommendationDebug?: RecommendationDebug;
};

type SearchablePhoto = GalleryPhoto & {
  location_text: string | null;
  album_id: string | null;
  photographer_id: string;
  generated_tags?: string[] | null;
  album?: {
    id: string;
    title: string | null;
    description: string | null;
    location_text: string | null;
  } | null;
  photographer: GalleryPhoto["photographer"] & {
    regions?: string[] | null;
    mood_tags?: string[] | null;
  };
};

type SearchQuery = {
  compact: string;
  terms: string[];
  initials: string[];
};

const LIKE_COUNT_BATCH_SIZE = 40;
const BROAD_SEARCH_THRESHOLD = 80;
const FIRST_SCREEN_SIZE = 48;
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const HANGUL_UNIT = 588;
const CHOSEONG = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
] as const;

const SEARCH_ALIASES: Record<string, string[]> = {
  감성: ["무드", "분위기", "내추럴", "자연스러운"],
  개인: ["프로필", "개인화보", "화보", "스냅"],
  데이트: ["커플", "연인", "스냅"],
  빈티지: ["필름", "레트로", "아날로그"],
  스냅: ["사진", "촬영", "화보"],
  웨딩: ["본식", "결혼", "브라이덜"],
  증명: ["프로필", "이력서", "여권"],
  프로필: ["개인", "화보", "증명"],
  필름: ["빈티지", "레트로", "아날로그"],
};

// 제자리 셔플 (탐색 낱개 랜덤 노출용)
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 작가 카드/프로필 공통
export type PhotographerCard = {
  id: string;
  display_name: string | null;
  bio: string;
  regions: string[];
  mood_tags: string[];
  rating_avg: number;
  review_count: number;
  price_from_krw: number;
  cover_url?: string | null;
};

// 검색어에서 PostgREST or-필터를 깨뜨릴 문자 제거
function sanitize(q: string): string {
  return q.replace(/[,(){}*]/g, " ").trim().slice(0, 40);
}

// 검색 비교용 정규화 — 사용자가 넣은 띄어쓰기 차이를 줄인다.
function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}ㄱ-ㅎㅏ-ㅣ]+/gu, "")
    .replace(/\s+/g, "");
}

function buildSearchQuery(qRaw: string): SearchQuery {
  const safe = sanitize(qRaw);
  const baseTerms = safe
    .split(/\s+/)
    .map(normalizeSearchText)
    .filter(Boolean);
  const compact = normalizeSearchText(safe);
  const expanded = expandSearchTerms([compact, ...baseTerms]);
  const initials = expanded.map(toChoseong).filter((term) => term.length >= 2);
  return {
    compact,
    terms: [...new Set(expanded.filter(Boolean))],
    initials: [...new Set(initials)],
  };
}

function expandSearchTerms(terms: string[]): string[] {
  const expanded = new Set<string>();
  for (const term of terms) {
    if (!term) continue;
    expanded.add(term);
    addAliasTerms(expanded, term);
    for (const key of Object.keys(SEARCH_ALIASES)) {
      if (term !== key && term.includes(key)) {
        expanded.add(key);
        addAliasTerms(expanded, key);
      }
    }
  }
  return [...expanded];
}

function addAliasTerms(expanded: Set<string>, term: string) {
  for (const alias of SEARCH_ALIASES[term] ?? []) {
    const normalized = normalizeSearchText(alias);
    if (normalized) expanded.add(normalized);
  }
}

function toChoseong(value: string): string {
  let out = "";
  for (const char of normalizeSearchText(value)) {
    const code = char.charCodeAt(0);
    if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
      out += CHOSEONG[Math.floor((code - HANGUL_BASE) / HANGUL_UNIT)] ?? "";
    } else if (/[ㄱ-ㅎ]/.test(char)) {
      out += char;
    }
  }
  return out;
}

// 공개 사진 갤러리 (무드·지역 필터). 승인 작가의 published 만.
export async function fetchPublishedPhotos(opts: {
  mood?: string;
  region?: string;
  limit?: number;
}): Promise<GalleryPhoto[]> {
  const supabase = await createClient();
  let q = supabase
    .from("photos")
    // !inner + RLS(anon은 승인 작가만 조회 가능) → 미승인 작가 사진은 자동 제외.
    // photos↔photographers FK가 2개(photographer_id, hero_photo_id)라 FK명으로 명시.
    .select(
      "id, src_url, thumb_url, width, height, region, mood_tags, price_krw, photographer:photographers!photos_photographer_id_fkey!inner(id, display_name)"
    )
    .eq("visibility", "published")
    .eq("feed_hidden", false) // 운영자 피드 숨김 제외
    .order("created_at", { ascending: false })
    // 클라이언트는 상한(FEED_CAP)까지만 받으므로 풀은 셔플 다양성에 충분한 만큼만.
    .limit(opts.limit ?? 400);

  if (opts.region) q = q.eq("region", opts.region);
  if (opts.mood) q = q.contains("mood_tags", [opts.mood]);

  const { data } = await q;
  // 최신 풀을 매 요청 랜덤 셔플 → 방문할 때마다 다른 순서. 클라이언트가 점진적으로 노출.
  return shuffle((data ?? []) as unknown as GalleryPhoto[]);
}

// 요청마다 다른 피드 순서용 시드 — 서버 컴포넌트 렌더에서 Math.random 직접 호출은
// react-hooks/purity 에 걸리므로 헬퍼로 분리.
export function newFeedSeed(): string {
  return Math.floor(Math.random() * 2 ** 31).toString(36);
}

type FeedRow = {
  id: string;
  src_url: string;
  thumb_url: string | null;
  width: number;
  height: number;
  region: string | null;
  mood_tags: string[] | null;
  price_krw: number | null;
  photographer_id: string;
  photographer_name: string | null;
};

// 홈 피드 페이지 — 시드 기반 랜덤 정렬(0050 RPC)로 무한 스크롤. seed 가 같으면 순서 일관.
// RPC 미적용(마이그레이션 전)/오류면 null → 호출부가 기존 방식으로 폴백.
export async function fetchSeededFeedPage(
  seed: string,
  page: number,
  pageSize = 48,
  tags?: string[]
): Promise<GalleryPhoto[] | null> {
  const supabase = await createClient();
  // 취향 태그가 있으면 취향 랭킹 RPC(feed_photos_taste), 없으면 순수 시드(feed_photos_seeded).
  const hasTaste = Array.isArray(tags) && tags.length > 0;
  const { data, error } = hasTaste
    ? await supabase.rpc("feed_photos_taste", {
        p_seed: seed,
        p_tags: tags,
        p_offset: page * pageSize,
        p_limit: pageSize,
      })
    : await supabase.rpc("feed_photos_seeded", {
        p_seed: seed,
        p_offset: page * pageSize,
        p_limit: pageSize,
      });
  if (error) return null;
  return ((data ?? []) as FeedRow[]).map((r) => ({
    id: r.id,
    src_url: r.src_url,
    thumb_url: r.thumb_url,
    width: r.width,
    height: r.height,
    region: r.region,
    mood_tags: r.mood_tags ?? [],
    price_krw: r.price_krw,
    photographer: { id: r.photographer_id, display_name: r.photographer_name },
  }));
}

// 순수 시드 피드 — 임의 오프셋(feed_photos_seeded). 오류/미적용 시 null.
export async function fetchSeededFeedAt(
  seed: string,
  offset: number,
  limit: number
): Promise<GalleryPhoto[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("feed_photos_seeded", {
    p_seed: seed,
    p_offset: offset,
    p_limit: limit,
  });
  if (error) return null;
  return ((data ?? []) as FeedRow[]).map((r) => ({
    id: r.id,
    src_url: r.src_url,
    thumb_url: r.thumb_url,
    width: r.width,
    height: r.height,
    region: r.region,
    mood_tags: r.mood_tags ?? [],
    price_krw: r.price_krw,
    photographer: { id: r.photographer_id, display_name: r.photographer_name },
  }));
}

// 운영자가 노출을 낮춘 사진 전용 꼬리. 일반 사진을 모두 본 뒤에만 페이지 단위로 호출한다.
export async function fetchDemotedHomeFeedPage(
  seed: string,
  page: number,
  pageSize = 48
): Promise<GalleryPhoto[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("photos")
    .select(
      "id, src_url, thumb_url, width, height, region, mood_tags, price_krw, photographer:photographers!photos_photographer_id_fkey!inner(id, display_name, status)"
    )
    .eq("visibility", "published")
    .eq("feed_hidden", true)
    .eq("photographer.status", "approved")
    .order("id", { ascending: true })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  return seededShuffle((data ?? []) as unknown as GalleryPhoto[], `${seed}:demoted:${page}`);
}

// 운영자가 피드에서 숨긴 사진 id — 소수라 한 번에 받아 집합으로 쓴다(부분 인덱스, 0075).
export async function fetchFeedHiddenIds(): Promise<Set<string>> {
  const admin = createAdminClient();
  const { data } = await admin.from("photos").select("id").eq("feed_hidden", true);
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
}

// 카테고리 멤버십 사진 id 집합 (관리자 클라 — 뷰어 무관 전체 멤버십)
// 운영자 피드 숨김은 여기서 뺀다 — 멤버십 자체는 두고 노출 면에서만 제외.
async function categoryMemberIds(catIds: string[]): Promise<Set<string>> {
  if (catIds.length === 0) return new Set();
  const admin = createAdminClient();
  const [{ data }, hidden] = await Promise.all([
    admin.from("explore_category_photos").select("photo_id").in("category_id", catIds),
    fetchFeedHiddenIds(),
  ]);
  const ids = ((data ?? []) as { photo_id: string }[])
    .map((r) => r.photo_id)
    .filter((id) => !hidden.has(id));
  return new Set(ids);
}

// 취향 헤드 순서(id) — 티어: 목적∩무드 → 목적만 → 무드만.
// 티어 내부는 (정렬 후) seed 셔플 → DB 반환순서와 무관하게 결정적(페이지 간 일관).
// 사진 데이터는 여기서 조회하지 않음(호출부가 필요한 슬라이스만 조회).
export async function fetchTasteHeadIds(
  purposeIds: string[],
  moodIds: string[],
  seed: string,
  cap = 200
): Promise<string[]> {
  if (purposeIds.length === 0 && moodIds.length === 0) return [];
  const [purposeSet, moodSet] = await Promise.all([
    categoryMemberIds(purposeIds),
    categoryMemberIds(moodIds),
  ]);
  const both: string[] = [];
  const purposeOnly: string[] = [];
  const moodOnly: string[] = [];
  for (const id of new Set([...purposeSet, ...moodSet])) {
    const inP = purposeSet.has(id);
    const inM = moodSet.has(id);
    if (inP && inM) both.push(id);
    else if (inP) purposeOnly.push(id);
    else moodOnly.push(id);
  }
  const tier = (ids: string[]) => seededShuffle([...ids].sort(), seed);
  return [...tier(both), ...tier(purposeOnly), ...tier(moodOnly)].slice(0, cap);
}

// 홈 피드 페이지 — 취향이 있으면 취향 헤드(티어)를 먼저, 소진되면 일반 시드 피드(헤드 중복 제외).
// 취향 없으면 순수 시드 피드. 초기 렌더(page.tsx)와 무한스크롤(loadMorePhotos) 공용.
export async function fetchHomeFeedPage(
  seed: string,
  page: number,
  purposeIds: string[],
  moodIds: string[],
  pageSize = 48
): Promise<GalleryPhoto[]> {
  const headIds = await fetchTasteHeadIds(purposeIds, moodIds, seed);
  const headLen = headIds.length;
  const start = page * pageSize;
  const out: GalleryPhoto[] = [];

  // 1) 취향 헤드 슬라이스(해당 페이지에 걸치는 만큼만 사진 데이터 조회)
  if (start < headLen) {
    const sliceIds = headIds.slice(start, Math.min(start + pageSize, headLen));
    out.push(...(await fetchLikedPhotosByIds(sliceIds)));
  }

  // 2) 부족분은 일반 시드 피드에서 채움(헤드 사진은 제외 → 중복 방지).
  //    일반 오프셋 = 전역 start 에서 헤드 길이만큼 당김. 창은 연속이라 누락·중복 없음.
  if (out.length < pageSize) {
    const gStart = Math.max(0, start - headLen);
    const gWidth = pageSize - out.length;
    const general = (await fetchSeededFeedAt(seed, gStart, gWidth)) ?? [];
    if (headLen > 0) {
      const headSet = new Set(headIds);
      out.push(...general.filter((p) => !headSet.has(p.id)));
    } else {
      out.push(...general);
    }
  }

  return out;
}

// 홈에서 클릭한 사진을 취향 신호로 사용한다. 클릭 수와 스타일 일관성에 따라 12~36장을
// 임베딩 유사 사진으로 교체해 탐색 다양성을 유지하고, 위치는 페이지별 시드로 불규칙하게 섞는다.
export async function fetchPersonalizedHomeFeedPage(
  seed: string,
  page: number,
  purposeIds: string[],
  moodIds: string[],
  clickedPhotoIds: string[],
  seenPhotoIds: string[],
  pageSize = 48
): Promise<GalleryPhoto[]> {
  const base = await fetchHomeFeedPage(seed, page, purposeIds, moodIds, pageSize);
  // 마지막 빈 페이지/자투리 페이지에서는 유사도 RPC를 호출하지 않고 즉시 사이클 전환시킨다.
  if (base.length < 8) return base;
  const recommendations = await fetchPersonalizedRecommendations(
    clickedPhotoIds,
    [...seenPhotoIds, ...base.map((photo) => photo.id)],
    36
  );
  // 최초 진입(page 0, 클릭 없음)은 일반 피드 그대로. 반복 사이클의 page 0은 클릭 신호가
  // 이미 있으므로 다른 페이지와 동일하게 개인화를 섞는다.
  if ((page === 0 && clickedPhotoIds.length === 0) || recommendations.length === 0) return base;

  const positions = seededShuffle(
    Array.from({ length: pageSize }, (_, index) => index),
    `${seed}:personalized:${page}`
  )
    .slice(0, recommendations.length)
    .sort((a, b) => a - b);
  const recommendationAt = new Map(positions.map((position, index) => [position, recommendations[index]]));
  const general = base.slice(0, Math.max(0, pageSize - recommendations.length));
  const mixed: GalleryPhoto[] = [];
  let generalIndex = 0;
  for (let index = 0; index < general.length + recommendations.length; index++) {
    const recommendation = recommendationAt.get(index);
    mixed.push(recommendation ?? general[generalIndex++]);
  }
  return mixed.filter(Boolean);
}

export async function fetchPersonalizedRecommendations(
  clickedPhotoIds: string[],
  excludedPhotoIds: string[],
  maxLimit = 36
): Promise<GalleryPhoto[]> {
  const anchors = [...new Set(clickedPhotoIds)].slice(-4).reverse();
  if (anchors.length === 0) return [];

  const supabase = await createClient();
  const { data: anchorRows } = await supabase
    .from("photos")
    .select("id, album_id, mood_tags")
    .in("id", anchors);
  const anchorById = new Map(
    ((anchorRows ?? []) as { id: string; album_id: string | null; mood_tags: string[] | null }[])
      .map((row) => [row.id, row])
  );

  const similarLists = await Promise.all(
    anchors.map(async (id) => {
      const anchor = anchorById.get(id);
      if (!anchor) return [];
      return fetchSimilarPhotosRaw({
        photoId: id,
        albumId: anchor.album_id,
        tags: anchor.mood_tags ?? [],
        limit: 120,
      });
    })
  );

  // 클릭 수 기본값: 1장=12, 2장=16, 3장 이상=20.
  // 각 클릭 사진의 상위 근접 이웃이 많이 겹치면 같은 스타일을 반복 선택한 것으로 보고
  // 24→30→36장까지 강화한다. 임베딩이 없는 사진은 태그 폴백 이웃으로 같은 계산을 한다.
  const baseTarget = anchors.length === 1 ? 12 : anchors.length === 2 ? 16 : 20;
  const styleConsistency = averageNeighborOverlap(similarLists, 60);
  const rankedSimilarLists = similarLists.map((list) =>
    orderSimilarWithDemotion(list, anchors.length, styleConsistency)
  );
  const boostedTarget =
    styleConsistency >= 0.55 ? 36
    : styleConsistency >= 0.4 ? 30
    : styleConsistency >= 0.25 ? 24
    : styleConsistency >= 0.12 ? 20
    : baseTarget;
  const target = Math.min(maxLimit, Math.max(baseTarget, boostedTarget));

  const excluded = new Set([...excludedPhotoIds, ...clickedPhotoIds]);
  const pickedIds: string[] = [];
  // 여러 사진을 눌렀다면 각 기준 사진의 후보를 한 장씩 번갈아 선택한다.
  for (let rank = 0; pickedIds.length < target; rank++) {
    let foundAtRank = false;
    for (const list of rankedSimilarLists) {
      const candidate = list[rank];
      if (!candidate) continue;
      foundAtRank = true;
      if (excluded.has(candidate.id)) continue;
      excluded.add(candidate.id);
      pickedIds.push(candidate.id);
      if (pickedIds.length === target) break;
    }
    if (!foundAtRank) break;
  }
  if (pickedIds.length === 0) return [];

  const recommendations = await fetchLikedPhotosByIds(pickedIds);
  const debugById = process.env.NODE_ENV !== "production"
    ? new Map(
        attachRecommendationDebug(
          rankedSimilarLists.flatMap((list) => list),
          anchors.length,
          styleConsistency
        ).map((photo) => [photo.id, photo.recommendationDebug])
      )
    : null;
  const decoratedRecommendations = debugById
    ? recommendations.map((photo, insertedRank) => {
        const debug = debugById.get(photo.id);
        return debug
          ? { ...photo, recommendationDebug: { ...debug, insertedRank } }
          : photo;
      })
    : recommendations;
  if (process.env.NODE_ENV !== "production") {
    console.info("[home-personalization]", {
      anchors,
      styleConsistency: Number(styleConsistency.toFixed(3)),
      target,
      inserted: decoratedRecommendations.length,
      recommendationIds: decoratedRecommendations.map((photo) => photo.id),
    });
  }
  return decoratedRecommendations;
}

export async function fetchRankedDetailRecommendations(
  clickedPhotoIds: string[],
  maxLimit = 120
): Promise<SimilarPhoto[]> {
  const anchors = [...new Set(clickedPhotoIds)].slice(-4).reverse();
  if (anchors.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select("id, album_id, mood_tags")
    .in("id", anchors);
  const byId = new Map(
    ((data ?? []) as { id: string; album_id: string | null; mood_tags: string[] | null }[])
      .map((row) => [row.id, row])
  );
  const lists = await Promise.all(
    anchors.map((id) => {
      const row = byId.get(id);
      return row
        ? fetchSimilarPhotosRaw({
            photoId: id,
            albumId: row.album_id,
            tags: row.mood_tags ?? [],
            limit: maxLimit,
          })
        : Promise.resolve([]);
    })
  );
  const consistency = averageNeighborOverlap(lists, 60);
  const primary = lists[0] ?? [];
  return orderSimilarWithDemotion(primary, anchors.length, consistency).slice(0, maxLimit);
}

function averageNeighborOverlap(lists: SimilarPhoto[][], sampleSize: number): number {
  if (lists.length < 2) return 0;
  const sets = lists.map((list) => new Set(list.slice(0, sampleSize).map((photo) => photo.id)));
  let total = 0;
  let pairs = 0;
  for (let left = 0; left < sets.length; left++) {
    for (let right = left + 1; right < sets.length; right++) {
      const denominator = Math.min(sets[left].size, sets[right].size);
      if (denominator === 0) continue;
      let intersection = 0;
      for (const id of sets[left]) if (sets[right].has(id)) intersection++;
      total += intersection / denominator;
      pairs++;
    }
  }
  return pairs > 0 ? total / pairs : 0;
}

const CATEGORY_SELECT =
  "id, src_url, thumb_url, width, height, region, mood_tags, price_krw, photographer:photographers!photos_photographer_id_fkey!inner(id, display_name)";

// 타겟 카테고리(/c/<slug>) 피드 — 사진 선정 기준은 '타겟 멤버십'이다.
//   멤버십 = 앨범 상속(작가가 포트폴리오에 고른 타겟) ∪ 운영자 수동 추가 − 운영자 제외
//            (resolveTargetPhotoIds — src/lib/target-categories.ts)
//
// 무드 태그(mood_tags)는 보지 않는다. 태그 겹침(overlaps)은 '감성·빈티지·여행' 같은 범용
// 태그 하나만 걸쳐도 매칭이라, 개인 스냅 피드에 웨딩·커플 사진이 섞여 들어왔다.
//
// 순서: 고정(ordered_photo_ids) → 멤버십 셔플 → 비멤버 공개 사진 셔플(꼬리).
// 꼬리는 카테고리 사진을 다 본 뒤에도 스크롤이 이어지게 하는 용도라 유지한다.
export async function fetchTargetCategoryFeed(
  memberIds: string[],
  orderedIds: string[] = []
): Promise<GalleryPhoto[]> {
  const supabase = await createClient();

  // 멤버 사진 — .in() URL 길이 방어로 200개씩 끊어 조회
  const members: GalleryPhoto[] = [];
  for (let i = 0; i < memberIds.length; i += 200) {
    const { data } = await supabase
      .from("photos")
      .select(CATEGORY_SELECT)
      .eq("visibility", "published")
      .eq("feed_hidden", false) // 운영자 피드 숨김 제외
      .in("id", memberIds.slice(i, i + 200));
    members.push(...((data ?? []) as unknown as GalleryPhoto[]));
  }

  // 꼬리(비멤버) — 최신 풀에서 멤버 제외. 무한스크롤 뒤쪽 채움용.
  const memberSet = new Set(members.map((p) => p.id));
  const { data: restData } = await supabase
    .from("photos")
    .select(CATEGORY_SELECT)
    .eq("visibility", "published")
    .eq("feed_hidden", false) // 운영자 피드 숨김 제외
    .order("created_at", { ascending: false })
    .limit(400);
  const rest = ((restData ?? []) as unknown as GalleryPhoto[]).filter((p) => !memberSet.has(p.id));

  // 운영자 고정 순서를 맨 앞에 그 순서대로
  const byId = new Map(members.map((p) => [p.id, p]));
  const pinned: GalleryPhoto[] = [];
  const seen = new Set<string>();
  for (const id of orderedIds) {
    const p = byId.get(id);
    if (p && !seen.has(id)) {
      pinned.push(p);
      seen.add(id);
    }
  }
  const restMembers = members.filter((p) => !seen.has(p.id));

  return [...pinned, ...shuffle(restMembers), ...shuffle(rest)];
}

// 무드 태그로 공개 사진 검색 — 부분 일치(대소문자 무시), 결과는 메이슨리 사진.
// text[] 부분 일치는 PostgREST 단일 연산자로 어려워, published 전체를 페이지 단위로 받아 JS에서 필터.
export async function searchPhotosByTag(qRaw: string): Promise<GalleryPhoto[]> {
  const query = buildSearchQuery(qRaw);
  if (!query.compact) return [];
  const supabase = await createClient();
  const rows = await fetchAllSearchablePhotos(supabase);
  const scored = rows
    .map((photo, index) => ({
      photo,
      index,
      score: calculateSearchScore(photo, query),
    }))
    .filter((item) => item.score > 0);
  const primary = await sortPhotosBySearchScore(supabase, scored);
  return appendRelatedPhotos(primary, rows);
}

// 검색어 정규화 키 — 검색어 로깅/집계의 그룹핑 키로 쓴다(대소문자·띄어쓰기 차이 흡수).
export function normalizeQuery(raw: string): string {
  return buildSearchQuery(raw).compact;
}

export type SearchScoreBreakdown = { label: string; score: number };
export type DebugSearchPhoto = {
  id: string;
  thumb_url: string | null;
  src_url: string;
  mood_tags: string[];
  generated_tags: string[];
  display_name: string | null;
};
export type DebugSearchResult = {
  photo: DebugSearchPhoto;
  score: number;
  breakdown: SearchScoreBreakdown[];
};
export type DebugSearchResponse = {
  query: SearchQuery;
  total: number;
  results: DebugSearchResult[];
};

// 어드민 디버그용 — 실제 검색과 동일한 점수로 상위 N개 + 필드별 기여도를 돌려준다.
// 정렬은 점수 내림차순만(분산/좋아요 보정 없이) — 원시 관련도를 그대로 보기 위함.
export async function debugSearchPhotos(qRaw: string, limit = 60): Promise<DebugSearchResponse> {
  const query = buildSearchQuery(qRaw);
  if (!query.compact) return { query, total: 0, results: [] };
  const supabase = await createClient();
  const rows = await fetchAllSearchablePhotos(supabase);
  const scored = rows
    .map((photo) => ({ photo, score: calculateSearchScore(photo, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const results: DebugSearchResult[] = scored.slice(0, limit).map(({ photo, score }) => {
    const breakdown = SEARCH_FIELDS.map((field) => ({ label: field.label, score: field.score(photo, query) })).filter(
      (item) => item.score > 0
    );
    const bonus = coverageBonus(photo, query);
    if (bonus > 0) breakdown.push({ label: "다중어 보너스", score: bonus });
    breakdown.sort((a, b) => b.score - a.score);
    return {
      photo: {
        id: photo.id,
        thumb_url: photo.thumb_url,
        src_url: photo.src_url,
        mood_tags: photo.mood_tags ?? [],
        generated_tags: photo.generated_tags ?? [],
        display_name: photo.photographer.display_name,
      },
      score,
      breakdown,
    };
  });

  return { query, total: scored.length, results };
}

// 점수 필드 정의 — 본 점수 합산과 디버그 분해가 같은 소스를 쓰게 한다(가중치 드리프트 방지).
const SEARCH_FIELDS: { label: string; score: (photo: SearchablePhoto, query: SearchQuery) => number }[] = [
  { label: "사진 태그(공개)", score: (p, q) => bestArrayScore(p.mood_tags, q, { exact: 150, startsWith: 115, includes: 90, initial: 55, fuzzy: 70 }) },
  { label: "검색 태그(숨김)", score: (p, q) => bestArrayScore(p.generated_tags, q, { exact: 135, startsWith: 105, includes: 82, initial: 50, fuzzy: 62 }) },
  { label: "앨범 제목", score: (p, q) => bestTextScore(p.album?.title, q, { exact: 105, startsWith: 85, includes: 65, initial: 35, fuzzy: 45 }) },
  { label: "사진 장소", score: (p, q) => bestTextScore(p.location_text, q, { exact: 95, startsWith: 75, includes: 58, initial: 30, fuzzy: 40 }) },
  { label: "앨범 장소", score: (p, q) => bestTextScore(p.album?.location_text, q, { exact: 90, startsWith: 70, includes: 54, initial: 28, fuzzy: 38 }) },
  { label: "지역", score: (p, q) => bestTextScore(p.region, q, { exact: 85, startsWith: 65, includes: 48, initial: 25, fuzzy: 36 }) },
  { label: "작가명", score: (p, q) => bestTextScore(p.photographer.display_name, q, { exact: 78, startsWith: 60, includes: 42, initial: 24, fuzzy: 30 }) },
  { label: "작가 태그", score: (p, q) => bestArrayScore(p.photographer.mood_tags, q, { exact: 72, startsWith: 55, includes: 38, initial: 22, fuzzy: 28 }) },
  { label: "작가 지역", score: (p, q) => bestArrayScore(p.photographer.regions, q, { exact: 68, startsWith: 50, includes: 34, initial: 20, fuzzy: 26 }) },
  { label: "앨범 설명", score: (p, q) => bestTextScore(p.album?.description, q, { exact: 45, startsWith: 34, includes: 24, initial: 12, fuzzy: 0 }) },
];

function calculateSearchScore(photo: SearchablePhoto, query: SearchQuery): number {
  let total = 0;
  for (const field of SEARCH_FIELDS) total += field.score(photo, query);
  return total + coverageBonus(photo, query);
}

function bestArrayScore(
  values: string[] | null | undefined,
  query: SearchQuery,
  weights: SearchWeights
): number {
  let best = 0;
  for (const value of values ?? []) {
    best = Math.max(best, bestTextScore(value, query, weights));
  }
  return best;
}

function bestTextScore(
  value: string | null | undefined,
  query: SearchQuery,
  weights: SearchWeights
): number {
  if (!value) return 0;
  const target = normalizeSearchText(value);
  const targetInitials = toChoseong(value);
  let score = 0;

  for (const term of query.terms) {
    if (!term) continue;
    if (target === term) score = Math.max(score, weights.exact);
    else if (target.startsWith(term)) score = Math.max(score, weights.startsWith);
    else if (target.includes(term)) score = Math.max(score, weights.includes);
    else if (weights.fuzzy > 0 && isNearTextMatch(target, term)) {
      score = Math.max(score, weights.fuzzy);
    }
  }
  for (const initial of query.initials) {
    if (targetInitials.includes(initial)) score = Math.max(score, weights.initial);
  }

  return score;
}

type SearchWeights = {
  exact: number;
  startsWith: number;
  includes: number;
  initial: number;
  fuzzy: number;
};

function isNearTextMatch(target: string, term: string): boolean {
  if (term.length < 2 || target.length > 24) return false;
  if (Math.abs(target.length - term.length) > 2) return false;
  const allowedDistance = term.length >= 5 ? 2 : 1;
  return limitedEditDistance(target, term, allowedDistance) <= allowedDistance;
}

export function limitedEditDistance(a: string, b: string, limit: number): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, curr[j]);
    }
    if (rowMin > limit) return limit + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }

  return prev[b.length];
}

function coverageBonus(photo: SearchablePhoto, query: SearchQuery): number {
  if (query.terms.length <= 1) return 0;
  const haystack = searchableTextBlob(photo);
  const matched = query.terms.filter((term) => haystack.includes(term)).length;
  return matched * 12;
}

function searchableTextBlob(photo: SearchablePhoto): string {
  return [
    ...(photo.mood_tags ?? []),
    ...(photo.generated_tags ?? []),
    photo.region,
    photo.location_text,
    photo.album?.title,
    photo.album?.location_text,
    photo.album?.description,
    photo.photographer.display_name,
    ...(photo.photographer.mood_tags ?? []),
    ...(photo.photographer.regions ?? []),
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalizeSearchText)
    .join(" ");
}

async function sortPhotosBySearchScore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scored: { photo: SearchablePhoto; index: number; score: number }[]
): Promise<GalleryPhoto[]> {
  if (scored.length === 0) return [];

  const counts: number[] = [];
  for (let start = 0; start < scored.length; start += LIKE_COUNT_BATCH_SIZE) {
    const batch = scored.slice(start, start + LIKE_COUNT_BATCH_SIZE);
    const batchCounts = await Promise.all(
      batch.map(async ({ photo }) => {
        try {
          const res = await supabase.rpc("photo_like_count", { pid: photo.id });
          return typeof res.data === "number" ? res.data : 0;
        } catch {
          return 0;
        }
      })
    );
    counts.push(...batchCounts);
  }

  // 관련도 점수를 우선하고, 좋아요 수는 보조 정렬로 쓴다.
  const sorted = scored
    .map((item, index) => ({ ...item, count: counts[index] ?? 0 }))
    .sort((a, b) => b.score - a.score || b.count - a.count || a.index - b.index);

  return distributeSearchResults(sorted).map((item) => item.photo);
}

type SearchResultItem = {
  photo: SearchablePhoto;
  index: number;
  score: number;
  count: number;
};

function distributeSearchResults(items: SearchResultItem[]): SearchResultItem[] {
  if (items.length >= BROAD_SEARCH_THRESHOLD) return distributeBroadSearchResults(items);

  const byScore = new Map<number, SearchResultItem[]>();
  for (const item of items) {
    const bucket = Math.floor(item.score / 10) * 10;
    (byScore.get(bucket) ?? byScore.set(bucket, []).get(bucket)!).push(item);
  }

  const result: SearchResultItem[] = [];
  for (const score of [...byScore.keys()].sort((a, b) => b - a)) {
    result.push(...roundRobinByAlbumAndPhotographer(byScore.get(score)!));
  }
  return result;
}

function distributeBroadSearchResults(items: SearchResultItem[]): SearchResultItem[] {
  const byScoreBand = new Map<number, SearchResultItem[]>();
  for (const item of items) {
    const band = Math.floor(item.score / 30) * 30;
    (byScoreBand.get(band) ?? byScoreBand.set(band, []).get(band)!).push(item);
  }

  const result: SearchResultItem[] = [];
  for (const score of [...byScoreBand.keys()].sort((a, b) => b - a)) {
    result.push(...greedyDiverseOrder(byScoreBand.get(score)!));
  }
  return diversifyFirstScreen(result);
}

function greedyDiverseOrder(items: SearchResultItem[]): SearchResultItem[] {
  const remaining = [...items];
  const result: SearchResultItem[] = [];
  const albumUse = new Map<string, number>();
  const photographerUse = new Map<string, number>();
  const recentAlbums: string[] = [];
  const recentPhotographers: string[] = [];

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    const scanLimit = Math.min(remaining.length, 120);

    for (let i = 0; i < scanLimit; i++) {
      const item = remaining[i];
      const albumKey = item.photo.album_id ?? item.photo.id;
      const photographerKey = item.photo.photographer_id;
      const diversityPenalty =
        (recentAlbums.includes(albumKey) ? 900 : 0) +
        (recentPhotographers.includes(photographerKey) ? 520 : 0) +
        (albumUse.get(albumKey) ?? 0) * 140 +
        (photographerUse.get(photographerKey) ?? 0) * 90;
      const candidateScore = item.score * 10 + item.count * 2 - item.index * 0.001 - diversityPenalty;

      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestIndex = i;
      }
    }

    const [picked] = remaining.splice(bestIndex, 1);
    const albumKey = picked.photo.album_id ?? picked.photo.id;
    const photographerKey = picked.photo.photographer_id;
    result.push(picked);
    albumUse.set(albumKey, (albumUse.get(albumKey) ?? 0) + 1);
    photographerUse.set(photographerKey, (photographerUse.get(photographerKey) ?? 0) + 1);
    pushRecent(recentAlbums, albumKey, 18);
    pushRecent(recentPhotographers, photographerKey, 8);
  }

  return result;
}

function diversifyFirstScreen(items: SearchResultItem[]): SearchResultItem[] {
  if (items.length <= FIRST_SCREEN_SIZE) return greedyFirstScreenOrder(items);

  const firstPool = items.slice(0, Math.min(items.length, FIRST_SCREEN_SIZE * 3));
  const rest = items.slice(firstPool.length);
  const firstScreen = greedyFirstScreenOrder(firstPool).slice(0, FIRST_SCREEN_SIZE);
  const firstIds = new Set(firstScreen.map((item) => item.photo.id));
  const leftovers = firstPool.filter((item) => !firstIds.has(item.photo.id));

  return [...firstScreen, ...leftovers, ...rest];
}

function greedyFirstScreenOrder(items: SearchResultItem[]): SearchResultItem[] {
  const remaining = [...items];
  const result: SearchResultItem[] = [];
  const recentAlbums: string[] = [];
  const recentPhotographers: string[] = [];
  const recentTags: string[] = [];

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    const scanLimit = Math.min(remaining.length, 96);

    for (let i = 0; i < scanLimit; i++) {
      const item = remaining[i];
      const albumKey = item.photo.album_id ?? item.photo.id;
      const photographerKey = item.photo.photographer_id;
      const tags = primaryDiversityTags(item.photo);
      const repeatedTagCount = tags.filter((tag) => recentTags.includes(tag)).length;
      const firstScreenPenalty =
        (recentAlbums.includes(albumKey) ? 1400 : 0) +
        (recentPhotographers.includes(photographerKey) ? 850 : 0) +
        repeatedTagCount * 220;
      const candidateScore = item.score * 10 + item.count * 2 - item.index * 0.001 - firstScreenPenalty;

      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestIndex = i;
      }
    }

    const [picked] = remaining.splice(bestIndex, 1);
    result.push(picked);
    pushRecent(recentAlbums, picked.photo.album_id ?? picked.photo.id, 24);
    pushRecent(recentPhotographers, picked.photo.photographer_id, 12);
    for (const tag of primaryDiversityTags(picked.photo)) pushRecent(recentTags, tag, 18);
  }

  return result;
}

function primaryDiversityTags(photo: SearchablePhoto): string[] {
  return [...(photo.mood_tags ?? []), ...(photo.generated_tags ?? []), photo.region ?? "", photo.album?.location_text ?? ""]
    .map(normalizeSearchText)
    .filter(Boolean)
    .slice(0, 4);
}

function pushRecent(values: string[], value: string, limit: number) {
  values.push(value);
  if (values.length > limit) values.shift();
}

function roundRobinByAlbumAndPhotographer(items: SearchResultItem[]): SearchResultItem[] {
  const groups = new Map<string, SearchResultItem[]>();
  for (const item of items) {
    const key = item.photo.album_id
      ? `album:${item.photo.album_id}`
      : `photographer:${item.photo.photographer_id}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(item);
  }

  const queues = [...groups.values()].sort((a, b) => (b[0]?.count ?? 0) - (a[0]?.count ?? 0));
  const result: SearchResultItem[] = [];
  for (let round = 0; ; round++) {
    let added = false;
    for (const queue of queues) {
      if (round < queue.length) {
        result.push(queue[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return result;
}

function appendRelatedPhotos(primary: GalleryPhoto[], allPhotos: SearchablePhoto[]): GalleryPhoto[] {
  if (primary.length === 0) return [];

  const primaryIds = new Set(primary.map((photo) => photo.id));
  const relatedTerms = buildRelatedTerms(primary);
  const related = allPhotos
    .filter((photo) => !primaryIds.has(photo.id))
    .map((photo, index) => ({
      photo,
      index,
      score: calculateRelatedScore(photo, relatedTerms),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item);

  return [...primary, ...distributeRelatedResults(related).map((item) => item.photo)];
}

function buildRelatedTerms(photos: GalleryPhoto[]): Set<string> {
  const terms = new Set<string>();
  for (const photo of photos) {
    for (const tag of photo.mood_tags ?? []) {
      const normalized = normalizeSearchText(tag);
      if (normalized) terms.add(normalized);
    }
    for (const tag of (photo as SearchablePhoto).generated_tags ?? []) {
      const normalized = normalizeSearchText(tag);
      if (normalized) terms.add(normalized);
    }
    if (photo.region) terms.add(normalizeSearchText(photo.region));
    if (photo.photographer.display_name) terms.add(normalizeSearchText(photo.photographer.display_name));
  }
  return terms;
}

function calculateRelatedScore(photo: SearchablePhoto, relatedTerms: Set<string>): number {
  if (relatedTerms.size === 0) return 0;
  let score = 0;

  for (const tag of photo.mood_tags ?? []) {
    const normalized = normalizeSearchText(tag);
    if (relatedTerms.has(normalized)) score += 10;
  }
  for (const tag of photo.photographer.mood_tags ?? []) {
    const normalized = normalizeSearchText(tag);
    if (relatedTerms.has(normalized)) score += 4;
  }
  for (const tag of photo.generated_tags ?? []) {
    const normalized = normalizeSearchText(tag);
    if (relatedTerms.has(normalized)) score += 8;
  }
  if (photo.region && relatedTerms.has(normalizeSearchText(photo.region))) score += 5;
  if (photo.album?.location_text && relatedTerms.has(normalizeSearchText(photo.album.location_text))) score += 3;

  return score;
}

type RelatedResultItem = {
  photo: SearchablePhoto;
  index: number;
  score: number;
};

function distributeRelatedResults(items: RelatedResultItem[]): RelatedResultItem[] {
  const byScore = new Map<number, RelatedResultItem[]>();
  for (const item of items) {
    const bucket = Math.max(0, Math.floor(item.score / 5) * 5);
    (byScore.get(bucket) ?? byScore.set(bucket, []).get(bucket)!).push(item);
  }

  const result: RelatedResultItem[] = [];
  for (const score of [...byScore.keys()].sort((a, b) => b - a)) {
    result.push(...roundRobinRelated(byScore.get(score)!));
  }
  return result;
}

function roundRobinRelated(items: RelatedResultItem[]): RelatedResultItem[] {
  const groups = new Map<string, RelatedResultItem[]>();
  for (const item of items) {
    const key = item.photo.album_id
      ? `album:${item.photo.album_id}`
      : `photographer:${item.photo.photographer_id}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(item);
  }

  const queues = [...groups.values()].sort((a, b) => b[0].score - a[0].score || a[0].index - b[0].index);
  const result: RelatedResultItem[] = [];
  for (let round = 0; ; round++) {
    let added = false;
    for (const queue of queues) {
      if (round < queue.length) {
        result.push(queue[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return result;
}

async function fetchAllSearchablePhotos(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<SearchablePhoto[]> {
  const pageSize = 1000;
  const rows: SearchablePhoto[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("photos")
      .select(
        "id, src_url, thumb_url, width, height, region, location_text, mood_tags, generated_tags, price_krw, album_id, photographer_id, album:albums(id, title, description, location_text), photographer:photographers!photos_photographer_id_fkey!inner(id, display_name, regions, mood_tags)"
      )
      .eq("visibility", "published")
      .eq("feed_hidden", false) // 운영자 피드 숨김 제외
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) break;
    const page = (data ?? []) as unknown as SearchablePhoto[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

// id 목록으로 작가 카드 조회 (찜 목록용). 승인 작가만, 대표 사진 포함.
// 주어진 사진들 중 현재 사용자가 좋아요한 id 집합 — 갤러리 하트 초기 상태용(1쿼리).
export async function fetchLikedPhotoIds(
  photoIds: string[],
  userId?: string
): Promise<string[]> {
  if (photoIds.length === 0) return [];
  // 비로그인 — 쿠키의 관심사진과 교집합
  if (!userId) {
    const anon = new Set(await readAnonFavPhotoIds());
    return photoIds.filter((id) => anon.has(id));
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("favorites")
    .select("target_id")
    .eq("profile_id", userId)
    .eq("target_type", "photo")
    .in("target_id", photoIds);
  return (data ?? []).map((r) => r.target_id as string);
}

export async function fetchPhotographersByIds(ids: string[]): Promise<PhotographerCard[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("photographers")
    .select("id, display_name, bio, regions, mood_tags, rating_avg, review_count, price_from_krw")
    .in("id", ids)
    .eq("status", "approved");

  const rows = (data ?? []) as PhotographerCard[];
  const covers = await coverPhotoMap(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, cover_url: covers[r.id] ?? null }));
}

// 작가 id 목록 → 각자의 대표(published) 사진 1장 맵
async function coverPhotoMap(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select("photographer_id, thumb_url, src_url")
    .in("photographer_id", ids)
    .eq("visibility", "published")
    .order("created_at", { ascending: false });

  const map: Record<string, string> = {};
  for (const p of data ?? []) {
    if (!map[p.photographer_id]) map[p.photographer_id] = p.thumb_url ?? p.src_url;
  }
  return map;
}

// 사진 상세용 1장 — 작가 정보 포함. RLS: published 또는 본인.
export type PhotoDetail = {
  id: string;
  src_url: string;
  thumb_url: string | null;
  width: number;
  height: number;
  mood_tags: string[];
  region: string | null;
  location_text: string | null;
  price_krw: number | null;
  album_id: string | null;
  photographer_id: string;
  photographer: { id: string; display_name: string | null } | null;
  // 사진별 작가 코멘트 — 추후 photos.caption 컬럼 추가 후 select 연동(현재 미선택 → undefined).
  caption?: string | null;
};

export async function fetchPhotoById(id: string): Promise<PhotoDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select(
      "id, src_url, thumb_url, width, height, mood_tags, region, location_text, price_krw, album_id, photographer_id, photographer:photographers!photos_photographer_id_fkey(id, display_name)"
    )
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as PhotoDetail) ?? null;
}

// 여러 사진의 좋아요 수 + 내 좋아요 여부 (캐러셀 슬라이드별 하트용)
export async function fetchPhotoLikeInfo(
  ids: string[],
  profileId?: string | null
): Promise<Record<string, { liked: boolean; count: number }>> {
  const out: Record<string, { liked: boolean; count: number }> = {};
  if (ids.length === 0) return out;
  const supabase = await createClient();

  const counts = await Promise.all(
    ids.map((id) =>
      supabase.rpc("photo_like_count", { pid: id }).then((r) => (typeof r.data === "number" ? r.data : 0))
    )
  );

  let likedSet = new Set<string>();
  if (profileId) {
    const { data } = await supabase
      .from("favorites")
      .select("target_id")
      .eq("profile_id", profileId)
      .eq("target_type", "photo")
      .in("target_id", ids);
    likedSet = new Set((data ?? []).map((f) => f.target_id as string));
  } else {
    // 비로그인 — 쿠키의 관심사진과 교집합
    const anon = new Set(await readAnonFavPhotoIds());
    likedSet = new Set(ids.filter((id) => anon.has(id)));
  }

  ids.forEach((id, i) => {
    out[id] = { liked: likedSet.has(id), count: counts[i] };
  });
  return out;
}

// 게시물(album) 설명글 — 사진 상세에 노출.
export async function fetchAlbumDescription(albumId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("albums")
    .select("description")
    .eq("id", albumId)
    .maybeSingle();
  return (data?.description as string | null) ?? null;
}

// 여러 게시물(album) 설명글 일괄 조회 — 작가 프로필 포트폴리오 모달용(앨범id → 설명).
export async function fetchAlbumDescriptions(
  albumIds: string[]
): Promise<Record<string, string>> {
  if (albumIds.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("albums")
    .select("id, description")
    .in("id", albumIds);
  const map: Record<string, string> = {};
  for (const a of data ?? []) {
    if (a.description) map[a.id as string] = a.description as string;
  }
  return map;
}

// 한 게시물(album)의 공개 사진들 — 스와이프 캐러셀용. 정렬 순.
export async function fetchAlbumPhotos(
  albumId: string
): Promise<{ id: string; src_url: string; thumb_url: string | null; width: number; height: number }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select("id, src_url, thumb_url, width, height")
    .eq("album_id", albumId)
    .eq("visibility", "published")
    // 게시물 대표 선정과 동일 정렬 → 대표가 캐러셀 첫 장(1/N)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  return (data ?? []) as {
    id: string;
    src_url: string;
    thumb_url: string | null;
    width: number;
    height: number;
  }[];
}

// 사진 id 목록으로 갤러리 카드 조회 — 주어진 ids 순서 유지. (published/본인만 RLS)
export async function fetchLikedPhotosByIds(ids: string[]): Promise<GalleryPhoto[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select(
      "id, src_url, thumb_url, width, height, region, mood_tags, price_krw, photographer:photographers!photos_photographer_id_fkey(id, display_name)"
    )
    .in("id", ids);

  const rows = (data ?? []) as unknown as GalleryPhoto[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((p): p is GalleryPhoto => !!p);
}

// 내가 좋아요한 사진들 (좋아요 최신순) — 찜 화면 '좋아요한 사진' 탭 (로그인)
export async function fetchMyLikedPhotos(profileId: string): Promise<GalleryPhoto[]> {
  const supabase = await createClient();
  const { data: favs } = await supabase
    .from("favorites")
    .select("target_id")
    .eq("profile_id", profileId)
    .eq("target_type", "photo")
    .order("created_at", { ascending: false });

  const ids = (favs ?? []).map((f) => f.target_id as string);
  return fetchLikedPhotosByIds(ids);
}

// 작가 id로 공개 프로필 (승인된 작가만)
export async function fetchPhotographerById(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("photographers")
    .select("id, display_name, bio, regions, mood_tags, rating_avg, review_count, price_from_krw, status")
    .eq("id", id)
    .eq("status", "approved")
    .maybeSingle();
  if (!data) return null;
  // 아바타는 profiles.avatar_url 에 있고 RLS상 본인만 조회 가능 →
  // 공개 노출용 security definer RPC 로 승인 작가의 아바타만 가져온다 (0046)
  const { data: avatarUrl } = await supabase.rpc("photographer_avatar_url", { pid: id });
  return { ...data, avatar_url: (avatarUrl as string | null) ?? null };
}

// 작가 공개 사진 (사진별 가격·장소·무드·게시물)
export async function fetchPhotographerPhotos(photographerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select("id, src_url, thumb_url, width, height, price_krw, location_text, region, mood_tags, album_id")
    .eq("photographer_id", photographerId)
    .eq("visibility", "published")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  return data ?? [];
}

// 유사 사진 — 사진 상세 '추천' 피드용.
// 기본 경로는 이미지 임베딩 근접검색(0069 RPC)이고, 임베딩이 아직 없는 사진은
// 기존 mood_tags 겹침 방식으로 폴백한다. 설계 배경은 docs/22.
// 전체 풀을 한 번에 반환하고 클라이언트가 점진 노출.
export type SimilarPhoto = {
  id: string;
  src_url: string;
  thumb_url: string | null;
  width: number;
  height: number;
  demoted: boolean;
  naturalRank: number;
};

export async function fetchSimilarPhotos(opts: {
  photoId: string;
  albumId: string | null;
  tags: string[];
  limit?: number;
}): Promise<SimilarPhoto[]> {
  return orderSimilarWithDemotion(await fetchSimilarPhotosRaw(opts), 1, 0);
}

async function fetchSimilarPhotosRaw(opts: {
  photoId: string;
  albumId: string | null;
  tags: string[];
  limit?: number;
}): Promise<SimilarPhoto[]> {
  const byEmbedding = await similarByEmbedding(opts.photoId, opts.limit ?? 120);
  if (byEmbedding.length > 0) return byEmbedding;
  // 임베딩이 아직 없는 신규 업로드(백필 배치 전)나 RPC 실패 시,
  // 추천이 통째로 비지 않도록 기존 태그 방식으로 떨어진다.
  return similarByTags(opts);
}

function orderSimilarWithDemotion(
  photos: SimilarPhoto[],
  anchorCount: number,
  styleConsistency: number
): SimilarPhoto[] {
  const normal = photos.filter((photo) => !photo.demoted);
  const demoted = photos.filter((photo) => photo.demoted);
  return mergeDemotedSimilar(normal, demoted, promotionStage(anchorCount, styleConsistency));
}

// 벡터 근접검색. RPC 가 published/approved·현재 사진·같은 게시물을 이미 걸러
// distance 오름차순으로 돌려주므로, 앱은 앨범 간격 배치만 얹는다.
async function similarByEmbedding(photoId: string, limit: number): Promise<SimilarPhoto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("similar_photos_by_embedding", {
    p_photo_id: photoId,
    p_limit: limit,
  });
  if (error || !data) return [];

  type Row = Omit<SimilarPhoto, "demoted" | "naturalRank"> & {
    album_id: string | null;
    distance: number;
    feed_hidden: boolean;
  };
  const rows = mapSimilarityRows(data as unknown as Row[]);

  // 시드의 게시물은 RPC 가 뺐지만, 다른 한 게시물이 상위를 연달아 채울 수는 있다.
  // 같은 촬영본은 벡터가 붙어 있어 태그 방식보다 오히려 몰리기 쉽다.
  // 유사도 순서를 최대한 보존하면서 인접 중복만 푼다.
  return spaceByAlbum(rows, (p) => p.album_id ?? `single:${p.id}`).map((p) => ({
    id: p.id,
    src_url: p.src_url,
    thumb_url: p.thumb_url,
    width: p.width,
    height: p.height,
    demoted: p.demoted,
    naturalRank: p.naturalRank,
  }));
}

// 폴백 — 기존 mood_tags 겹침 방식. 현재 사진/같은 게시물 제외.
async function similarByTags(opts: {
  photoId: string;
  albumId: string | null;
  tags: string[];
  limit?: number;
}): Promise<SimilarPhoto[]> {
  const supabase = await createClient();
  const limit = 400;
  const { data } = await supabase
    .from("photos")
    // 승인 작가의 published 만(!inner + RLS). 현재 사진 제외.
    .select(
      "id, src_url, thumb_url, width, height, mood_tags, album_id, feed_hidden, photographer:photographers!photos_photographer_id_fkey!inner(id)"
    )
    .eq("visibility", "published")
    .neq("id", opts.photoId)
    .order("created_at", { ascending: false })
    .limit(limit);

  type Row = Omit<SimilarPhoto, "demoted" | "naturalRank"> & {
    mood_tags: string[] | null;
    album_id: string | null;
    feed_hidden: boolean;
  };
  type MappedRow = Omit<Row, "feed_hidden"> & { demoted: boolean; naturalRank: number };
  const rows: MappedRow[] = mapSimilarityRows((data ?? []) as unknown as Row[]);
  const tagSet = new Set((opts.tags ?? []).map((t) => t.toLowerCase()));

  // 같은 게시물(앨범) 사진 제외 (null 앨범은 유지)
  const candidates = rows.filter((p) => !(opts.albumId && p.album_id === opts.albumId));

  // 태그 겹침 점수 계산
  const score = (p: MappedRow) =>
    tagSet.size === 0 ? 0 : (p.mood_tags ?? []).filter((t) => tagSet.has(t.toLowerCase())).length;

  // 점수별 묶기 (점수 높은 묶음이 위로)
  const byScore = new Map<number, MappedRow[]>();
  for (const p of candidates) {
    const s = score(p);
    (byScore.get(s) ?? byScore.set(s, []).get(s)!).push(p);
  }

  // 점수 묶음 안에서 앨범별 라운드로빈 → 같은 게시물 사진이 줄지어 뜨지 않게 분산.
  // 유사도(점수)는 그대로 상위 유지하되, 동점은 여러 게시물이 번갈아 섞이도록.
  const ordered: MappedRow[] = [];
  for (const s of [...byScore.keys()].sort((a, b) => b - a)) {
    const items = byScore.get(s)!;
    // 앨범(단일 사진은 각자)별로 묶고, 앨범 순서·앨범 내 순서를 셔플
    const albums = new Map<string, MappedRow[]>();
    for (const p of items) {
      const key = p.album_id ?? `single:${p.id}`;
      (albums.get(key) ?? albums.set(key, []).get(key)!).push(p);
    }
    const groups = shuffle([...albums.values()].map((g) => shuffle(g)));
    // 라운드로빈: 각 앨범에서 한 장씩 번갈아 뽑기
    for (let round = 0; ; round++) {
      let any = false;
      for (const g of groups) {
        if (round < g.length) {
          ordered.push(g[round]);
          any = true;
        }
      }
      if (!any) break;
    }
  }

  // 최종 간격 보정 — 인접한 두 사진이 같은 게시물(앨범)이 되지 않도록 재배치.
  // 라운드로빈만으로는 한 앨범만 남거나 점수 묶음 경계에서 같은 앨범이 연속될 수 있어, 한 번 더 보장.
  const spaced = spaceByAlbum(ordered, (p) => p.album_id ?? `single:${p.id}`);

  return spaced.map((p) => ({
    id: p.id,
    src_url: p.src_url,
    thumb_url: p.thumb_url,
    width: p.width,
    height: p.height,
    demoted: p.demoted,
    naturalRank: p.naturalRank,
  }));
}

// 우선순위 순서를 최대한 보존하면서, 인접한 두 항목이 같은 키(게시물)가 되지 않게 재배치.
// 다음 항목이 직전과 같은 게시물이면 그 뒤에서 다른 게시물을 먼저 꺼내 끼워넣는다.
// 남은 게 전부 같은 게시물뿐일 때만 불가피하게 연속된다.
function spaceByAlbum<T>(items: T[], keyOf: (item: T) => string): T[] {
  const pending = [...items];
  const out: T[] = [];
  let lastKey: string | null = null;
  while (pending.length > 0) {
    let idx = pending.findIndex((it) => keyOf(it) !== lastKey);
    if (idx === -1) idx = 0; // 전부 같은 게시물이면 어쩔 수 없이 연속
    const [picked] = pending.splice(idx, 1);
    out.push(picked);
    lastKey = keyOf(picked);
  }
  return out;
}

// 작가 활성 패키지
export async function fetchPhotographerPackages(photographerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("packages")
    .select("id, name, description, price_krw, duration_min, edited_count")
    .eq("photographer_id", photographerId)
    .eq("is_active", true)
    .order("price_krw", { ascending: true });
  return data ?? [];
}

// 사용자 사진 → 닮은 사매 사진 찾기.
//
// ⚠️ 평균 벡터 한 방으로 찾으면 안 된다 (2026-08-20 실측으로 확인).
// 씨앗 사진이 다양하면 평균이 그 다양성을 뭉개서 임베딩 공간의 '한가운데'로 가고,
// 거기서 최근접을 뽑으면 DB 에서 가장 밀도 높은 군집만 나온다.
// 실제로 '감성-시네마틱(한복·야경·클로즈업)' 과 '밝은(웨딩·야구장·거리)' 이
// 서로 완전히 다른 씨앗을 넣었는데도 **거의 같은 캐주얼 웨딩 사진 세트**를 돌려줬다.
// 입력이 뭐든 같은 답이 나오면 그건 추천이 아니다.
//
// 그래서 사진마다 따로 검색하고 라운드로빈으로 섞는다.
//   · 씨앗 각각의 '닮은 사진' 이 최소 한 장씩은 자리를 얻는다
//   · 앨범당 상한을 둬서 한 촬영본이 결과를 통째로 먹는 것을 막는다
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type SimilarPhoto = {
  id: string;
  src_url: string;
  thumb_url: string | null;
  album_id: string | null;
  photographer_id: string | null;
  distance: number;
};

/** 씨앗 1장당 가져올 후보 수. 라운드로빈으로 섞을 여유분. */
const PER_SEED = 8;
/** 같은 앨범(=같은 촬영본)에서 최대 몇 장까지 허용할지. 없으면 한 앨범이 결과를 독점한다. */
const MAX_PER_ALBUM = 2;

async function knn(embedding: number[], limit: number): Promise<SimilarPhoto[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("similar_photos_by_vector", {
    // pgvector 는 '[0.1,0.2,...]' 문자열 리터럴을 받는다
    p_embedding: JSON.stringify(embedding),
    p_limit: limit,
  });
  if (error) {
    console.error("[persona] 유사 사진 검색 실패:", error.message);
    return [];
  }
  return (data ?? []) as SimilarPhoto[];
}

/**
 * 사용자 사진 벡터들 → 닮은 사매 사진.
 * @param vectors 사용자 사진 1장당 1개 벡터 (L2 정규화 상태)
 * @param count   최종 반환 장수
 */
export async function findSimilarPhotos(
  vectors: number[][],
  count = 9,
  /** 결과에서 뺄 사진 id. 평가 하네스에서 '씨앗으로 넣은 사매 사진'을 제외할 때 쓴다.
   *  (실서비스에서는 사용자 인스타 사진이 DB 에 없으므로 보통 비어 있다) */
  exclude: Set<string> = new Set()
): Promise<SimilarPhoto[]> {
  if (vectors.length === 0) return [];

  // 씨앗별 후보를 병렬로 — 각 쿼리는 HNSW 라 수십 ms 다.
  // 제외 목록이 있으면 그만큼 더 받아 와야 뽑을 게 남는다.
  const perSeedLimit = PER_SEED + Math.min(exclude.size, 16);
  const perSeed = (await Promise.all(vectors.map((v) => knn(v, perSeedLimit)))).map((list) =>
    list.filter((c) => !exclude.has(c.id))
  );

  // 후보를 한 줄로 펴서 **거리순**으로 본다.
  // 순수 라운드로빈(씨앗마다 공평하게 한 장씩)은 씨앗이 균질할 때 오히려 나빠진다 —
  // 잘 맞는 씨앗의 3등이 못 맞는 씨앗의 1등보다 훨씬 가까운데도 밀려나기 때문이다.
  // 실측(시크-모던, 스튜디오 인물 8장)에서 그렇게 밀려난 자리에 관계없는 웨딩 사진이 들어왔다.
  const flat = perSeed
    .flatMap((list, seedIdx) => list.map((c) => ({ ...c, seedIdx })))
    .sort((a, b) => a.distance - b.distance);

  // 대신 상한 두 개로 쏠림을 막는다.
  //   · 앨범 상한 — 없으면 한 촬영본이 결과를 통째로 먹어 '같은 사람 8장'이 된다(전략 A 의 실패)
  //   · 씨앗 상한 — 없으면 가장 흔한 사진 한 장이 결과를 지배해 다양성이 사라진다
  const perSeedCap = Math.max(2, Math.ceil(count / Math.max(vectors.length, 1)) + 1);

  const picked: SimilarPhoto[] = [];
  const seenPhoto = new Set<string>();
  const albumCount = new Map<string, number>();
  const seedCount = new Map<number, number>();

  for (const c of flat) {
    if (picked.length >= count) break;
    if (seenPhoto.has(c.id)) continue;

    const album = c.album_id ?? `_none_${c.id}`;
    if ((albumCount.get(album) ?? 0) >= MAX_PER_ALBUM) continue;
    if ((seedCount.get(c.seedIdx) ?? 0) >= perSeedCap) continue;

    seenPhoto.add(c.id);
    albumCount.set(album, (albumCount.get(album) ?? 0) + 1);
    seedCount.set(c.seedIdx, (seedCount.get(c.seedIdx) ?? 0) + 1);
    picked.push(c);
  }

  // 상한 때문에 모자라면 거리순으로 채운다 (빈 자리보다는 낫다)
  for (const c of flat) {
    if (picked.length >= count) break;
    if (seenPhoto.has(c.id)) continue;
    seenPhoto.add(c.id);
    picked.push(c);
  }

  return picked.slice(0, count);
}

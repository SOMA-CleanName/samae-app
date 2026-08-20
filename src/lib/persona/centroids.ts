// 무드·목적 중심벡터 — LLM 없이 SigLIP 임베딩만으로 무드/목적을 고른다.
//
// 검증(2026-08-20, scripts/persona-centroid-eval.mts · leave-out 조건):
//   중심벡터 1위 적중 5/5 — LLM(haiku, "2~3개 안에 5/5")보다 날카롭다.
//   판단은 임베딩 공간에서 직접 재는 게 낫고, LLM 은 문장만 쓰면 된다.
//
// 중심은 요청 시 계산 + 10분 메모 — 카테고리 큐레이션이 바뀌면 자동 반영되고,
// 스키마 변경(별도 컬럼·백필)이 필요 없다. 계산 비용: 무드 5개 × ~300장 임베딩
// 로드 ≈ 2~3초(콜드 1회) — memoTtl 이 흡수한다.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveExplorePhotoIds } from "@/lib/target-categories";
import { PURPOSE_OPTIONS, purposeByKey } from "@/lib/taste-purposes";
import { resolveCategoryIdsBySlugs } from "@/lib/explore-db";
import { memoTtl } from "@/lib/server-memo";

export type MoodCentroid = { id: string; title: string; centroid: number[] };

function meanNorm(vs: number[][]): number[] {
  const d = vs[0].length;
  const out = new Array<number>(d).fill(0);
  for (const v of vs) for (let i = 0; i < d; i++) out[i] += v[i];
  let norm = 0;
  for (let i = 0; i < d; i++) {
    out[i] /= vs.length;
    norm += out[i] * out[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < d; i++) out[i] /= norm;
  return out;
}

export const cosine = (a: number[], b: number[]): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

async function fetchEmbeddings(ids: string[]): Promise<number[][]> {
  const admin = createAdminClient();
  const out: number[][] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await admin
      .from("photos")
      .select("embedding")
      .in("id", ids.slice(i, i + 100))
      .not("embedding", "is", null);
    for (const r of (data ?? []) as Array<{ embedding: string }>) {
      out.push(JSON.parse(r.embedding) as number[]);
    }
  }
  return out;
}

/** 공개 무드 카테고리별 중심벡터 (10분 메모) */
export async function getMoodCentroids(): Promise<MoodCentroid[]> {
  return memoTtl("persona:mood-centroids", 10 * 60_000, async () => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("explore_categories")
      .select("id,title")
      .eq("published", true)
      .eq("kind", "mood")
      .order("sort");
    const moods = (data ?? []) as Array<{ id: string; title: string }>;

    const out: MoodCentroid[] = [];
    for (const m of moods) {
      const ids = await resolveExplorePhotoIds(m.id);
      const embs = await fetchEmbeddings(ids);
      if (embs.length >= 10) out.push({ id: m.id, title: m.title, centroid: meanNorm(embs) });
    }
    return out;
  });
}

/** 촬영 목적(purposeKey)별 중심벡터 — 목적 카테고리에 담긴 사진으로 (10분 메모) */
export async function getPurposeCentroids(): Promise<Array<{ key: string; centroid: number[] }>> {
  return memoTtl("persona:purpose-centroids", 10 * 60_000, async () => {
    const out: Array<{ key: string; centroid: number[] }> = [];
    for (const p of PURPOSE_OPTIONS) {
      const catIds = await resolveCategoryIdsBySlugs(purposeByKey(p.key)?.categorySlugs ?? []);
      // categorySlugs 는 탐색 카테고리 — 같은 리졸버를 쓴다
      const photoIds = (await Promise.all(catIds.map((id) => resolveExplorePhotoIds(id)))).flat();
      const embs = await fetchEmbeddings([...new Set(photoIds)].slice(0, 400));
      if (embs.length >= 10) out.push({ key: p.key, centroid: meanNorm(embs) });
    }
    return out;
  });
}

/** 사용자 평균벡터 → 무드 상위 k개 + 무드별 근거 사진 인덱스(1-base) */
export function classifyMoods(
  userVecs: number[][],
  centroids: MoodCentroid[],
  k = 2
): Array<{ id: string; title: string; sim: number; photoIndexes: number[] }> {
  const userMean = meanNorm(userVecs);
  return [...centroids]
    .map((c) => ({
      id: c.id,
      title: c.title,
      sim: cosine(userMean, c.centroid),
      // 이 무드에 가장 가까운 사용자 사진 = 수학적으로 정직한 근거
      photoIndexes: userVecs
        .map((v, i) => ({ i: i + 1, s: cosine(v, c.centroid) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 3)
        .map((x) => x.i),
    }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k);
}

// 무드 선택을 SigLIP 중심벡터로 대체할 수 있는지 — LLM 없이 공짜로 검증.
//
// 방식: 무드 카테고리별로 소속 사진 임베딩의 평균(중심벡터)을 만들고,
// '사용자 피드'(배타 사진 표본)의 평균벡터와 코사인 유사도로 무드를 고른다.
// 정답 정의는 persona-eval 과 동일(배타 사진 기반) — LLM(haiku) 실측과 직접 비교 가능.
//
// 실행: npx tsx --conditions=react-server --env-file=.env --env-file=.env.local \
//         scripts/persona-centroid-eval.mts

import { createAdminClient } from "../src/lib/supabase/admin";
import { resolveExplorePhotoIds } from "../src/lib/target-categories";

const admin = createAdminClient();
const PHOTO_N = 9; // persona-eval 과 동일 표본 크기

/** photos.embedding(halfvec 직렬화 문자열) → number[] */
function parseVec(s: string): number[] {
  return JSON.parse(s) as number[];
}

function mean(vs: number[][]): number[] {
  const d = vs[0].length;
  const out = new Array(d).fill(0);
  for (const v of vs) for (let i = 0; i < d; i++) out[i] += v[i];
  let norm = 0;
  for (let i = 0; i < d; i++) {
    out[i] /= vs.length;
    norm += out[i] * out[i];
  }
  norm = Math.sqrt(norm) || 1;
  return out.map((x) => x / norm);
}

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

async function fetchEmbeddings(ids: string[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await admin
      .from("photos")
      .select("id, embedding")
      .in("id", ids.slice(i, i + 100))
      .not("embedding", "is", null);
    for (const r of (data ?? []) as Array<{ id: string; embedding: string }>) {
      out.set(r.id, parseVec(r.embedding));
    }
  }
  return out;
}

async function main() {
  const { data } = await admin
    .from("explore_categories")
    .select("id,title")
    .eq("published", true)
    .eq("kind", "mood")
    .order("sort");
  const moods = (data ?? []) as Array<{ id: string; title: string }>;

  // 무드별 사진 + 배타 집합 (persona-eval 과 동일한 정답 정의)
  const byMood = new Map<string, string[]>();
  for (const m of moods) byMood.set(m.id, await resolveExplorePhotoIds(m.id));
  const seen = new Set<string>();
  const shared = new Set<string>();
  for (const ids of byMood.values()) for (const id of ids) (seen.has(id) ? shared : seen).add(id);

  const pick = <T,>(arr: T[], k: number): T[] =>
    arr.length <= k ? arr : Array.from({ length: k }, (_, i) => arr[Math.round((i * (arr.length - 1)) / (k - 1))]);

  // 중심벡터 — ⚠️ 시험 표본(씨앗)을 중심 계산에서 빼야 한다. 안 빼면 자기 사진과
  // 비교하는 셈이라 적중이 부풀려진다 (leave-out).
  console.log("무드별 중심벡터 구성 중…");
  const seedByMood = new Map<string, string[]>();
  for (const m of moods) {
    const exclusive = (byMood.get(m.id) ?? []).filter((id) => !shared.has(id));
    seedByMood.set(m.id, pick(exclusive.slice(0, Math.floor(exclusive.length / 2)), PHOTO_N));
  }
  const centroids = new Map<string, number[]>();
  for (const m of moods) {
    const seeds = new Set(seedByMood.get(m.id));
    const memberIds = (byMood.get(m.id) ?? []).filter((id) => !seeds.has(id));
    const embs = await fetchEmbeddings(memberIds);
    if (embs.size < 10) {
      console.log(`⏭️  ${m.title} — 임베딩 ${embs.size}개뿐이라 제외`);
      continue;
    }
    centroids.set(m.id, mean([...embs.values()]));
    console.log(`  ${m.title}: 사진 ${embs.size}장으로 중심 구성`);
  }

  console.log(`\n${"정답 무드".padEnd(12)} ${"1위 선택".padEnd(12)} 적중  유사도(1~3위)`);
  console.log("─".repeat(64));
  let top1 = 0;
  let top2 = 0;
  let cases = 0;

  for (const m of moods) {
    if (!centroids.has(m.id)) continue;
    const seedIds = seedByMood.get(m.id) ?? [];
    if (seedIds.length < PHOTO_N) continue;
    const seedEmbs = await fetchEmbeddings(seedIds);
    if (seedEmbs.size < 5) continue;
    const user = mean([...seedEmbs.values()]);

    const ranked = [...centroids.entries()]
      .map(([id, c]) => ({ id, sim: dot(user, c) }))
      .sort((a, b) => b.sim - a.sim);
    const t = (id: string) => moods.find((x) => x.id === id)?.title ?? "?";

    cases++;
    const hit1 = ranked[0].id === m.id;
    const hit2 = hit1 || ranked[1]?.id === m.id;
    if (hit1) top1++;
    if (hit2) top2++;
    console.log(
      `${m.title.padEnd(12)} ${t(ranked[0].id).padEnd(12)} ${hit1 ? "✅" : hit2 ? "2위" : "❌"}   ` +
        ranked.slice(0, 3).map((r) => `${t(r.id)} ${r.sim.toFixed(3)}`).join(" · ")
    );
  }

  console.log("─".repeat(64));
  console.log(`\n📊 1위 적중 ${top1}/${cases} · 상위2 안 ${top2}/${cases}`);
  console.log(`   (LLM haiku 실측: 정답이 선택 2~3개 안에 5/5 — 비교 기준)`);
}

main().catch((e) => {
  console.error("실패:", e);
  process.exit(1);
});

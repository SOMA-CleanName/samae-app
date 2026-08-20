// 임베딩 기반 추천 전 구간 검증 — "내 사진과 닮은 사매 사진" 이 실제로 나오는가.
//
// 경로: 사용자 사진 URL → 512px 축소 → 로컬 SigLIP 서비스 → 평균 벡터
//       → similar_photos_by_vector RPC → 추천 사진
//
// 정답 판정: 특정 무드의 '배타적' 사진을 사용자 피드인 척 넣고,
// 돌아온 추천이 같은 무드에 속하는 비율을 본다. (persona-eval 과 같은 하네스 철학)
//
// 실행: npx tsx --conditions=react-server --env-file=.env --env-file=.env.local \
//         scripts/persona-embed-e2e.mts [무드수] [사진수]

import sharp from "sharp";
import { createAdminClient } from "../src/lib/supabase/admin";
import { resolveExplorePhotoIds } from "../src/lib/target-categories";

const MOOD_N = Number(process.argv[2] ?? 5);
const PHOTO_N = Number(process.argv[3] ?? 9);
const EMBED_URL = process.env.PERSONA_EMBED_URL ?? "http://127.0.0.1:8077";

const admin = createAdminClient();

async function toBase64(url: string): Promise<string | null> {
  try {
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    const small = await sharp(buf, { failOn: "none" })
      .rotate()
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return small.toString("base64");
  } catch {
    return null;
  }
}

async function embedMean(images: string[]): Promise<{ mean: number[]; ms: number }> {
  const t = performance.now();
  const res = await fetch(`${EMBED_URL}/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ images }),
  });
  if (!res.ok) throw new Error(`embed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { mean: number[]; infer_ms: number };
  return { mean: j.mean, ms: performance.now() - t };
}

async function main() {
  const { data: moodRows } = await admin
    .from("explore_categories")
    .select("id, title")
    .eq("published", true)
    .eq("kind", "mood")
    .order("sort", { ascending: true });
  const moods = (moodRows ?? []).map((r) => ({ id: r.id as string, title: r.title as string }));

  // 무드별 사진 집합 + 배타적 사진 (persona-eval 과 동일한 정답 정의)
  const byMood = new Map<string, string[]>();
  for (const m of moods) byMood.set(m.id, await resolveExplorePhotoIds(m.id));
  const shared = new Set<string>();
  const seen = new Set<string>();
  for (const ids of byMood.values())
    for (const id of ids) (seen.has(id) ? shared : seen).add(id);

  const pick = <T,>(arr: T[], k: number): T[] =>
    arr.length <= k ? arr : Array.from({ length: k }, (_, i) => arr[Math.round((i * (arr.length - 1)) / (k - 1))]);

  console.log(`${"무드".padEnd(16)} ${"임베딩".padEnd(9)} ${"검색".padEnd(8)} ${"정답무드 비율".padEnd(14)} 상위 거리`);
  console.log("─".repeat(72));

  let hitSum = 0;
  let cases = 0;

  for (const mood of moods.slice(0, MOOD_N)) {
    const exclusive = (byMood.get(mood.id) ?? []).filter((id) => !shared.has(id));
    if (exclusive.length < PHOTO_N * 2) continue;

    // 앞쪽 절반을 '사용자 피드'로 쓰고, 추천 결과가 같은 무드에 속하는지 본다.
    // (같은 사진이 그대로 돌아오는 자기참조를 피하려고 씨앗과 정답셋을 분리)
    const seedIds = pick(exclusive.slice(0, Math.floor(exclusive.length / 2)), PHOTO_N);
    const truth = new Set(byMood.get(mood.id) ?? []);

    const { data: seedPhotos } = await admin.from("photos").select("id, src_url").in("id", seedIds);
    const b64 = (await Promise.all((seedPhotos ?? []).map((p) => toBase64(p.src_url as string)))).filter(
      (x): x is string => !!x
    );
    if (b64.length < 3) continue;

    const { mean, ms } = await embedMean(b64);

    const t = performance.now();
    const { data: hits, error } = await admin.rpc("similar_photos_by_vector", {
      p_embedding: JSON.stringify(mean),
      p_limit: 12,
    });
    const searchMs = performance.now() - t;
    if (error) {
      console.log(`${mood.title.padEnd(16)} RPC 오류: ${error.message}`);
      continue;
    }

    const rows = (hits ?? []) as Array<{ id: string; distance: number }>;
    // 씨앗으로 넣은 사진 자신은 제외하고 센다
    const seedSet = new Set(seedIds);
    const fresh = rows.filter((r) => !seedSet.has(r.id));
    const inMood = fresh.filter((r) => truth.has(r.id)).length;
    const ratio = fresh.length ? inMood / fresh.length : 0;
    hitSum += ratio;
    cases++;

    console.log(
      `${mood.title.padEnd(16)} ${(ms.toFixed(0) + "ms").padEnd(9)} ${(searchMs.toFixed(0) + "ms").padEnd(8)} ` +
        `${`${inMood}/${fresh.length} (${(ratio * 100).toFixed(0)}%)`.padEnd(14)} ${fresh[0]?.distance?.toFixed(3) ?? "-"}`
    );
  }

  console.log("─".repeat(72));
  console.log(`\n📊 평균 정답무드 비율: ${cases ? ((hitSum / cases) * 100).toFixed(1) : "-"}%  (${cases}개 무드)`);
  console.log(`   무작위 기대치는 무드 1개 비중 정도 — 그보다 확실히 높아야 '닮은 사진'이라 할 수 있다.`);
}

main().catch((e) => {
  console.error("실패:", e.message);
  process.exit(1);
});

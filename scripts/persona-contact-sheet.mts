// 추천 품질을 '눈으로' 판정하기 위한 콘택트 시트.
//
// 무드 태그 일치율은 대리지표다 — 태그는 큐레이션 산물이라 '시각적으로 닮았지만
// 다른 무드로 분류된 사진'을 전부 오답으로 센다. 실제로 판단해야 할 질문은
// "돌아온 사진이 내 사진처럼 생겼는가" 하나뿐이고, 그건 보면 안다.
//
// 위(씨앗) / 아래(추천) 두 줄로 붙여 한 장의 PNG 로 뽑는다.
//
// 실행: npx tsx --conditions=react-server --env-file=.env --env-file=.env.local \
//         scripts/persona-contact-sheet.mts <출력디렉터리> [무드수] [사진수]

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createAdminClient } from "../src/lib/supabase/admin";
import { resolveExplorePhotoIds } from "../src/lib/target-categories";
import { findSimilarPhotos } from "../src/lib/persona/similar";

const OUT_DIR = process.argv[2] ?? "/tmp/persona-sheets";
const MOOD_N = Number(process.argv[3] ?? 5);
const PHOTO_N = Number(process.argv[4] ?? 8);
const EMBED_URL = process.env.PERSONA_EMBED_URL ?? "http://127.0.0.1:8077";

const CELL = 200; // 셀 한 변(px)
const admin = createAdminClient();

async function thumb(url: string): Promise<Buffer | null> {
  try {
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    return await sharp(buf, { failOn: "none" })
      .rotate()
      .resize(CELL, CELL, { fit: "cover" })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    return null;
  }
}

async function b64(url: string): Promise<string | null> {
  try {
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    const s = await sharp(buf, { failOn: "none" })
      .rotate()
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return s.toString("base64");
  } catch {
    return null;
  }
}

/** 라벨 띠 + 셀들을 한 줄로 붙인다 */
async function row(label: string, cells: Buffer[], width: number): Promise<Buffer> {
  const strip = await sharp({
    create: { width, height: 28, channels: 3, background: { r: 20, g: 20, b: 20 } },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${width}" height="28"><text x="8" y="19" font-family="sans-serif" font-size="14" fill="#eee">${label}</text></svg>`
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();

  const stripRow = await sharp({
    create: { width, height: CELL, channels: 3, background: { r: 10, g: 10, b: 10 } },
  })
    .composite(cells.map((input, i) => ({ input, top: 0, left: i * CELL })))
    .png()
    .toBuffer();

  return sharp({ create: { width, height: 28 + CELL, channels: 3, background: { r: 10, g: 10, b: 10 } } })
    .composite([
      { input: strip, top: 0, left: 0 },
      { input: stripRow, top: 28, left: 0 },
    ])
    .png()
    .toBuffer();
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const { data } = await admin
    .from("explore_categories")
    .select("id,title")
    .eq("published", true)
    .eq("kind", "mood")
    .order("sort");
  const moods = (data ?? []) as Array<{ id: string; title: string }>;

  const byMood = new Map<string, string[]>();
  for (const m of moods) byMood.set(m.id, await resolveExplorePhotoIds(m.id));
  const seen = new Set<string>();
  const shared = new Set<string>();
  for (const ids of byMood.values()) for (const id of ids) (seen.has(id) ? shared : seen).add(id);

  const pick = <T,>(arr: T[], k: number): T[] =>
    arr.length <= k ? arr : Array.from({ length: k }, (_, i) => arr[Math.round((i * (arr.length - 1)) / (k - 1))]);

  for (const mood of moods.slice(0, MOOD_N)) {
    const exclusive = (byMood.get(mood.id) ?? []).filter((id) => !shared.has(id));
    if (exclusive.length < PHOTO_N * 2) continue;

    const seedIds = pick(exclusive.slice(0, Math.floor(exclusive.length / 2)), PHOTO_N);
    const { data: seeds } = await admin.from("photos").select("id, src_url").in("id", seedIds);
    const seedUrls = (seeds ?? []).map((p) => p.src_url as string);

    const images = (await Promise.all(seedUrls.map(b64))).filter((x): x is string => !!x);
    const res = await fetch(`${EMBED_URL}/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ images }),
    });
    const { mean, vectors } = (await res.json()) as { mean: number[]; vectors: number[][] };
    const seedSet = new Set(seedIds);

    // 전략 A — 평균 벡터 한 방 (현재 문제: 입력이 달라도 같은 군집으로 수렴)
    const { data: hits } = await admin.rpc("similar_photos_by_vector", {
      p_embedding: JSON.stringify(mean),
      p_limit: 24,
    });
    const rows = ((hits ?? []) as Array<{ id: string; src_url: string; distance: number }>)
      .filter((r) => !seedSet.has(r.id))
      .slice(0, PHOTO_N);

    // 전략 B — 씨앗별 검색 + 라운드로빈 + 앨범 상한
    const merged = await findSimilarPhotos(vectors, PHOTO_N, seedSet);

    const seedCells = (await Promise.all(seedUrls.slice(0, PHOTO_N).map(thumb))).filter((b): b is Buffer => !!b);
    const hitCells = (await Promise.all(rows.map((r) => thumb(r.src_url)))).filter((b): b is Buffer => !!b);
    const mergedCells = (await Promise.all(merged.map((r) => thumb(r.src_url)))).filter((b): b is Buffer => !!b);
    const width = CELL * Math.max(seedCells.length, hitCells.length, mergedCells.length);

    const r0 = await row(`내 사진 (씨앗) — ${mood.title}`, seedCells, width);
    const r1 = await row(`A · 평균벡터 1회 검색`, hitCells, width);
    const r2 = await row(`B · 씨앗별 검색 + 라운드로빈 + 앨범상한`, mergedCells, width);

    const out = path.join(OUT_DIR, `${mood.title}.png`);
    const H = 28 + CELL;
    await sharp({
      create: { width, height: H * 3 + 16, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .composite([
        { input: r0, top: 0, left: 0 },
        { input: r1, top: H + 8, left: 0 },
        { input: r2, top: (H + 8) * 2, left: 0 },
      ])
      .png()
      .toFile(out);
    console.log(`✅ ${out}`);
  }
}

main().catch((e) => {
  console.error("실패:", e.message);
  process.exit(1);
});

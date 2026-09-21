// 추출 엔진 실측 — 실제 작가 자료를 넣고 카드·불일치·질문이 어떻게 나오는지 본다.
//   npx tsx scripts/kb-extract-try.ts <작가id> <자료파일>
//
// DB 는 읽기만 한다(대조용 패키지·소개글). 결과는 화면에만 찍고 저장하지 않는다.

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { extractKbFromMaterial, type SamaeSnapshot } from "../src/lib/kb-extract.ts";

function loadEnv() {
  const raw = require("node:fs").readFileSync(".env.local", "utf8") as string;
  for (const line of raw.split("\n")) {
    if (!line.includes("=") || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}

async function main() {
  loadEnv();
  const [pid, materialPath] = process.argv.slice(2);
  if (!pid || !materialPath) throw new Error("사용법: kb-extract-try.ts <작가id> <자료파일>");

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: p } = await db
    .from("photographers")
    .select("display_name, bio, price_from_krw, travel_fee_krw")
    .eq("id", pid)
    .single();
  if (!p) throw new Error("작가를 찾지 못했다");
  const { data: pk } = await db
    .from("packages")
    .select("name, description, price_krw, duration_min, edited_count, is_active")
    .eq("photographer_id", pid);

  const samae: SamaeSnapshot = {
    bio: p.bio,
    priceFromKrw: p.price_from_krw,
    travelFeeKrw: p.travel_fee_krw,
    packages: (pk ?? []).map((x) => ({
      name: x.name,
      description: x.description,
      priceKrw: x.price_krw,
      durationMin: x.duration_min,
      editedCount: x.edited_count,
      isActive: x.is_active,
    })),
  };

  const material = await readFile(materialPath, "utf8");
  console.log(`자료 ${material.length}자 · 대조 패키지 ${samae.packages.length}개 · 추출 시작…\n`);
  const t0 = process.hrtime.bigint();
  const result = await extractKbFromMaterial({
    photographerName: p.display_name ?? "",
    material,
    samae,
  });
  const secs = Number(process.hrtime.bigint() - t0) / 1e9;

  console.log(`━━ 카드 ${result.cards.length}장 (${secs.toFixed(1)}초) ━━`);
  const byTopic = new Map<string, number>();
  for (const c of result.cards) byTopic.set(c.topic, (byTopic.get(c.topic) ?? 0) + 1);
  for (const [t, n] of byTopic) console.log(`  ${t} · ${n}장`);

  console.log(`\n━━ 불일치 ${result.conflicts.length}건 ━━`);
  for (const c of result.conflicts) {
    console.log(`  · ${c.subject}`);
    console.log(`      자료: ${c.fromMaterial}`);
    console.log(`      사매: ${c.fromSamae}`);
  }

  console.log(`\n━━ 핵심 주제 누락: ${result.missingCoreTopics.join(", ") || "없음"} ━━`);

  console.log(`\n━━ 질문 ${result.questions.length}개 ━━`);
  result.questions.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));

  console.log(`\n━━ 보류 ${result.held.length}장 (금지 문구) ━━`);
  for (const h of result.held) console.log(`  ⚠ [${h.card.id}] ${h.reason}\n      ${h.card.body}`);

  console.log(`\n━━ 카드 전문 ━━`);
  for (const c of result.cards) console.log(`  [${c.topic}] ${c.id}\n    ${c.body}`);
}

main();

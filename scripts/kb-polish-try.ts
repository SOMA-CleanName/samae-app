// 다듬기 실측 — 저장 전에 전/후를 눈으로 본다
//   npx tsx scripts/kb-polish-try.ts <카드JSON> [출력JSON]
import { readFile, writeFile } from "node:fs/promises";
import { polishCards } from "../src/lib/kb-style.ts";

/** .env.local 을 직접 읽는다 — 스크립트는 Next 런타임 밖이라 자동 주입이 없다 */
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
  const [inPath, outPath] = process.argv.slice(2);
  const cards = JSON.parse(await readFile(inPath, "utf8"));
  const t0 = Date.now();
  const out = await polishCards(cards);
  console.log(`${out.length}장 · ${((Date.now() - t0) / 1000).toFixed(0)}초\n`);
  for (const p of out) {
    if (p.before === p.after) { console.log(`= [${p.id}] 그대로\n`); continue; }
    console.log(`[${p.id}]`);
    console.log(`  전 · ${p.before}`);
    console.log(`  후 · ${p.after}`);
    if (p.dropped) console.log(`  뺌 · ${p.dropped}`);
    if (p.problems.length) console.log(`  ⚠ ${p.problems.join(" / ")}`);
    console.log();
  }
  const bad = out.filter((p) => p.problems.length);
  console.log(bad.length ? `⚠ 사실이 바뀐 것으로 보이는 카드 ${bad.length}장` : "✓ 사실 검사 통과");
  if (outPath) {
    await writeFile(outPath, JSON.stringify(
      cards.map((c: { id: string }) => ({ ...c, body: out.find((p) => p.id === c.id)?.after ?? (c as never) })), null, 2));
  }
}
main();

// 실제 렌더러로 시안을 굽는다 — 제품과 같은 코드라 여기서 본 게 그대로 나온다.
//   npx tsx scripts/guide-preview.tsx <카드JSON> <출력폴더> [fonts|templates|backdrops]
//
// 시안용 코드를 따로 두면 반드시 어긋난다(예전 guide-variants.tsx 가 그랬다).
// 여기서는 renderGuideCard 를 그대로 부른다.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { groupCardsIntoSheets, renderGuideCard } from "../src/lib/guide-card-template.tsx";
import { BACKDROPS, FONTS, TEMPLATES, DEFAULT_GUIDE_STYLE } from "../src/lib/guide-style.ts";

async function main() {
const [cardsPath, outDir, mode = "fonts"] = process.argv.slice(2);
if (!cardsPath || !outDir) throw new Error("사용법: guide-preview.tsx <카드JSON> <출력폴더> [fonts|templates|backdrops]");

const cards = JSON.parse(await readFile(cardsPath, "utf8"));
const sheets = groupCardsIntoSheets(cards);
if (sheets.length === 0) throw new Error("카드가 없다");
await mkdir(outDir, { recursive: true });

/** 무엇을 돌려가며 볼지 */
const axis =
  mode === "templates"
    ? TEMPLATES.map((t) => ({ name: `template-${t.key}`, style: { template: t.key } }))
    : mode === "backdrops"
      ? BACKDROPS.map((b) => ({ name: `backdrop-${b.key}`, style: { backdrop: b.key } }))
      : FONTS.map((f) => ({ name: `font-${f.key}`, style: { font: f.key } }));

for (const v of axis) {
  const style = { ...DEFAULT_GUIDE_STYLE, ...v.style };
  const res = await renderGuideCard("모글필름", sheets[0], style);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(`${outDir}/${v.name}.png`, buf);
  console.log(`  ${v.name}.png · ${(buf.length / 1024).toFixed(0)}KB`);
}
}

main();

// 재단 전/후 높이 비교 — 쓸데없는 여백이 실제로 줄었는지 본다
//   npx tsx scripts/guide-fit-try.tsx <카드JSON>
import { readFile } from "node:fs/promises";
import { groupCardsIntoSheets, renderGuideCard, renderGuideCardFitted } from "../src/lib/guide-card-template.tsx";
import { TEMPLATES, DEFAULT_GUIDE_STYLE } from "../src/lib/guide-style.ts";

async function main() {
  const cards = JSON.parse(await readFile(process.argv[2], "utf8"));
  const sheets = groupCardsIntoSheets(cards);
  for (const t of TEMPLATES) {
    const style = { ...DEFAULT_GUIDE_STYLE, template: t.key };
    const rows: string[] = [];
    for (const s of sheets) {
      const before = Buffer.from(await (await renderGuideCard("모글", s, style)).arrayBuffer());
      const b = await import("sharp").then((m) => m.default(before).metadata());
      const { height } = await renderGuideCardFitted("모글", s, style);
      rows.push(`${s.label} ${b.height}→${height}${height < (b.height ?? 0) ? ` (-${(b.height ?? 0) - height})` : ""}`);
    }
    console.log(`[${t.label}] ${rows.join(" · ")}`);
  }
}
main();

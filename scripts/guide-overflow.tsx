// 얼마나 넘치는지 잰다 — 넉넉히 그려 놓고 실제 글 끝이 어디인지 본다
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { groupCardsIntoSheets, renderGuideCard } from "../src/lib/guide-card-template.tsx";
import { FONTS, TEMPLATES, DEFAULT_GUIDE_STYLE } from "../src/lib/guide-style.ts";
async function main() {
  const cards = JSON.parse(await readFile(process.argv[2], "utf8"));
  const sheets = groupCardsIntoSheets(cards);
  let worst = { gap: 1e9, who: "" };
  for (const f of FONTS) for (const t of TEMPLATES) for (const s of sheets) {
    const res = await renderGuideCard("모글필름", s, { ...DEFAULT_GUIDE_STYLE, font: f.key, template: t.key });
    const buf = Buffer.from(await res.arrayBuffer());
    const m = await sharp(buf).metadata();
    const px = await sharp(buf).extract({ left: 8, top: 0, width: m.width - 16, height: m.height }).greyscale().raw().toBuffer();
    const w = m.width - 16;
    let last = 0;
    for (let y = m.height - 1; y >= 0; y--) {
      let dark = 0;
      for (let x = 0; x < w; x++) if (px[y * w + x] < 120) dark++;
      if (dark > 3) { last = y; break; }
    }
    const gap = m.height - last;
    if (gap < worst.gap) worst = { gap, who: `${f.key}/${t.key}/${s.label} (높이 ${m.height}, 글끝 ${last})` };
  }
  console.log("가장 빠듯한 조합:", worst.who, "· 남은 여백", worst.gap, "px");
}
main();

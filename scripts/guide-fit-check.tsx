// 조합마다 아래가 잘리지 않는지 본다 (글씨체가 바뀌면 줄 수가 바뀐다)
//   npx tsx scripts/guide-fit-check.tsx <카드JSON>
// 글씨체가 바뀌면 줄 수가 바뀐다 — 어느 조합에서도 아래가 잘리지 않는지 본다
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { groupCardsIntoSheets, renderGuideCardFitted } from "../src/lib/guide-card-template.tsx";
import { FONTS, TEMPLATES, DEFAULT_GUIDE_STYLE } from "../src/lib/guide-style.ts";
async function main() {
  const cards = JSON.parse(await readFile(process.argv[2], "utf8"));
  const sheets = groupCardsIntoSheets(cards);
  let bad = 0;
  for (const f of FONTS) for (const t of TEMPLATES) for (const s of sheets) {
    // 재단까지 마친 결과를 본다 — 실제로 나가는 게 이것이다
    const { png: buf, height } = await renderGuideCardFitted("모글필름", s, {
      ...DEFAULT_GUIDE_STYLE,
      font: f.key,
      template: t.key,
    });
    const m = { width: 1080, height };
    // 맨 아랫줄에 글자가 닿아 있으면 잘린 것이다.
    // min 으로 재면 안 된다 — 가장자리 안티앨리어싱 한 점 때문에 늘 걸린다.
    // 어두운 픽셀이 **몇 개인지** 센다.
    const px = await sharp(buf)
      .extract({ left: 8, top: m.height - 8, width: m.width - 16, height: 8 })
      .greyscale().raw().toBuffer();
    const dark = px.reduce((n, v) => n + (v < 120 ? 1 : 0), 0);
    if (dark > px.length * 0.001) {
      console.log(`✗ ${f.key}/${t.key}/${s.label} 바닥에 글자 닿음(어두운 픽셀 ${dark}/${px.length})`);
      bad++;
    }
  }
  console.log(bad === 0 ? `✓ ${FONTS.length}×${TEMPLATES.length}×${sheets.length} 조합 모두 안 잘림` : `${bad}건 문제`);
}
main();

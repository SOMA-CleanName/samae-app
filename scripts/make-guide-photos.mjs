// 사진 배경지 만들기 — CC0 사진을 안내 이미지 배경으로 가공한다.
//   node scripts/make-guide-photos.mjs <원본폴더>
//
// 왜 가공하는가: 사진을 그대로 깔면 글자가 안 읽힌다. 배경은 "보이는 것"이 아니라
// "읽히게 받쳐주는 것"이라, 원본의 분위기만 남기고 대비와 채도를 눌러야 한다.
//   · 세로로 크롭      — 안내 이미지는 1080×긴세로
//   · 채도·대비 낮추기 — 원색이 튀면 글자와 싸운다
//   · 밝기 올리기      — 어두운 배경 위 검은 글자는 못 읽는다
//   · 살짝 흐리기      — 디테일이 선명하면 눈이 그쪽으로 간다
//
// 라이선스: 전부 CC0(퍼블릭 도메인). 출처 표시 의무는 없지만 어디서 왔는지는
// public/guide-bg/CREDITS.md 에 남긴다 — 나중에 누가 물어볼 때 답할 수 있어야 한다.

import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { ensureReadable } from "./guide-bg-readable.mjs";

const W = 720;
const H = 1600;
const OUT = "public/guide-bg";

/** 고른 사진과 각자에게 맞는 보정값 */
const PICKS = [
  {
    key: "dune",
    label: "모래결",
    src: "모래-4.jpg",
    // 사막 능선의 결이 살아야 해서 흐림을 약하게, 따뜻한 쪽으로
    mod: { brightness: 1.1, saturation: 0.55, blur: 1.2, tint: "#f6efe2", tintAlpha: 0.3 },
  },
  {
    key: "glint",
    label: "윤슬",
    // 퍼블릭 도메인. 폴더 대신 주소에서 받는다 — 원본 없이도 다시 만들 수 있게.
    url: "https://upload.wikimedia.org/wikipedia/commons/8/84/How_Many_Suns.JPG",
    credit: "commons.wikimedia.org/wiki/File:How_Many_Suns.JPG · Public domain",
    // 흐리면 반짝임이 뭉개져 그냥 얼룩이 된다. 밝기로 누르지 말고 **톤을 압축**한다 —
    // 흑백으로 바꾼 뒤 [lo,hi] 안에만 담으면 반짝임의 모양은 남고 대비만 낮아진다.
    tone: {
      // 아래쪽엔 배·물가 윤곽이 있다. 알아볼 수 있는 물체는 배경에서 시선을 뺏으므로
      // 순수하게 반짝이기만 하는 위쪽 45% 만 쓴다.
      cropTop: 0,
      cropFrac: 0.45,
      lo: 198,
      hi: 250,
      blur: 3.2,
      tint: "#f6f5f2",
    },
  },
  {
    key: "papyrus",
    label: "옛종이",
    src: "종이-2.jpg",
    mod: { brightness: 1.05, saturation: 0.6, blur: 0.5, tint: "#f7f2e6", tintAlpha: 0.2 },
  },
];

/** 원본 한 장 가져오기 — 주소가 적힌 것은 받아 오고, 아니면 폴더에서 읽는다 */
async function source(p, dir) {
  if (p.url) {
    const r = await fetch(p.url, { headers: { "User-Agent": "samae-guide-bg/1.0" } });
    if (!r.ok) throw new Error(`${p.key}: 원본 받기 실패 ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  if (!dir) throw new Error(`${p.key}: 원본 폴더가 필요하다`);
  return `${dir}/${p.src}`;
}

/** 톤 압축 방식 — 반짝임(윤슬)을 살려야 하는 사진용 */
async function toneMapped(input, t) {
  const m = await sharp(input).metadata();
  let img = sharp(input);
  if (t.cropFrac) {
    img = img.extract({
      left: 0,
      top: Math.round(m.height * (t.cropTop ?? 0)),
      width: m.width,
      height: Math.round(m.height * t.cropFrac),
    });
  }
  // sharp 는 체이닝 순서가 아니라 고정 순서로 처리한다. normalise 가 linear 를
  // 되돌려 버리므로 단계를 버퍼로 끊어 넘긴다.
  const step1 = await img
    .resize(W * 2, H * 2, { fit: "cover", position: "centre" })
    .greyscale()
    .normalise()
    .blur(t.blur * 2)
    .resize(W, H)
    .toBuffer();
  return sharp(step1)
    .linear((t.hi - t.lo) / 255, t.lo)
    .tint(t.tint)
    .toBuffer();
}

async function main() {
  const dir = process.argv[2];
  await mkdir(OUT, { recursive: true });

  const credits = ["# 배경 사진 출처", "", "전부 저작권 걱정 없는 것만 쓴다 (CC0·퍼블릭 도메인).", ""];

  for (const p of PICKS) {
    let src;
    try {
      src = await source(p, dir);
    } catch (e) {
      // 폴더 없이 한 장만 다시 굽는 경우가 많다 — 못 받은 것만 건너뛴다
      console.log(`  (건너뜀) ${p.key}: ${e.message}`);
      credits.push(`- **${p.label}** (\`${p.key}.jpg\`) — ${p.credit ?? "CC0"}`);
      continue;
    }

    if (p.tone) {
      const buf = await sharp(await ensureReadable(await toneMapped(src, p.tone)))
        .jpeg({ quality: 86 })
        .toBuffer();
      await writeFile(`${OUT}/${p.key}.jpg`, buf);
      console.log(`  ${p.key}.jpg (${p.label}) · ${(buf.length / 1024).toFixed(0)}KB`);
      credits.push(`- **${p.label}** (\`${p.key}.jpg\`) — ${p.credit ?? "CC0"}`);
      continue;
    }

    const { brightness, saturation, blur, tint, tintAlpha } = p.mod;
    const base = await sharp(src)
      .resize(W, H, { fit: "cover", position: "attention" })
      .modulate({ brightness, saturation })
      .blur(blur)
      .toBuffer();

    // 크림 막을 한 겹 — 원본 색을 사매 톤으로 끌어오고 대비를 눌러 글자 자리를 만든다
    const veil = await sharp({
      create: { width: W, height: H, channels: 4, background: { ...hexToRgb(tint), alpha: tintAlpha } },
    })
      .png()
      .toBuffer();

    const veiled = await sharp(base).composite([{ input: veil, blend: "over" }]).toBuffer();
    // 글자가 읽히는지는 취향이 아니라 조건이다 — 여기서 강제한다
    const buf = await sharp(await ensureReadable(veiled)).jpeg({ quality: 82 }).toBuffer();

    await writeFile(`${OUT}/${p.key}.jpg`, buf);
    console.log(`  ${p.key}.jpg (${p.label}) · ${(buf.length / 1024).toFixed(0)}KB`);
    credits.push(`- **${p.label}** (\`${p.key}.jpg\`) — CC0`);
  }

  await writeFile(`${OUT}/CREDITS.md`, credits.join("\n") + "\n");
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

main();

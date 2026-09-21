// 안내 이미지 배경 질감 만들기 (한 번 돌리고 결과물을 커밋한다)
//   node scripts/make-guide-textures.mjs
//
// 왜 그리는가: 스톡 사진은 상업적 재배포 라이선스를 매번 따져야 하고, 작가 사진은
// 저작권이 작가에게 있어 다른 작가 안내물에 쓸 수 없다. 그려서 만들면 그 문제가 없다.
//
// 어떻게 그리는가: 처음엔 흐린 얼룩만 만들어 "질감 흉내" 에 그쳤다. 진짜 재질감은
// **빛**에서 나온다 — feTurbulence 로 요철을 만들고 feDiffuseLighting 으로 그 위에
// 빛을 먹이면 종이의 접힌 면과 그늘이 생긴다. 물빛은 feDisplacementMap 으로 수면을
// 일렁이게 한 뒤 별 모양 하이라이트를 얹는다.

import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { ensureReadable } from "./guide-bg-readable.mjs";

const W = 720;
const H = 1600;
const OUT = "public/guide-bg";

/** 시드 고정 난수 — 다시 돌려도 같은 그림이 나오게 */
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

/**
 * 윤슬 한 점 — 가운데가 밝고 네 방향으로 빛살이 뻗는다.
 * 빛살을 짧게(2.1배) 잡는다: 길면 별 스티커처럼 보이고 사진의 반짝임과 멀어진다.
 */
function sparkle(cx, cy, r, o) {
  const d = r * 2.1;
  return `<g opacity="${o.toFixed(2)}" transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)})">
    <path d="M0 ${-d} Q ${r * 0.28} ${-r * 0.28} ${d} 0 Q ${r * 0.28} ${r * 0.28} 0 ${d} Q ${-r * 0.28} ${r * 0.28} ${-d} 0 Q ${-r * 0.28} ${-r * 0.28} 0 ${-d} Z" fill="#ffffff"/>
    <circle r="${(r * 0.9).toFixed(1)}" fill="#ffffff"/>
  </g>`;
}

/** 필터가 닿지 않는 가장자리를 메울 바탕색 — 없으면 투명이 JPEG 에서 검게 굳는다 */
const BASE = { linen: "#efe9dc" };

const TEXTURES = {



  // 리넨 — 직물 올. 씨실과 날실이 빛을 다르게 받는다
  linen: `
    <defs>
      <filter id="weave">
        <feTurbulence type="fractalNoise" baseFrequency="0.02 0.62" numOctaves="2" seed="4" result="warp"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.62 0.02" numOctaves="2" seed="8" result="weft"/>
        <feComposite in="warp" in2="weft" operator="arithmetic" k1="0" k2="0.5" k3="0.5" k4="0" result="cloth"/>
        <feDiffuseLighting in="cloth" surfaceScale="1.5" diffuseConstant="1" lighting-color="#ffffff">
          <feDistantLight azimuth="225" elevation="55"/>
        </feDiffuseLighting>
      </filter>
    </defs>
    <rect width="100%" height="100%" fill="#f2eee4"/>
    <rect width="100%" height="100%" filter="url(#weave)" opacity="0.85" style="mix-blend-mode:multiply"/>
    <rect width="100%" height="100%" fill="#e8dfcd" opacity="0.3" style="mix-blend-mode:multiply"/>`,
};

async function main() {
  await mkdir(OUT, { recursive: true });
  for (const [key, body] of Object.entries(TEXTURES)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
    // 변위 필터는 가장자리에서 캔버스 밖을 끌어와 톱니를 남긴다. 바탕색으로 메운 뒤
    // 테두리 M px 를 잘라내 그 흔적을 없앤다.
    const M = 14;
    const raw = await sharp(Buffer.from(svg))
      .flatten({ background: BASE[key] })
      .extract({ left: M, top: M, width: W - M * 2, height: H - M * 2 })
      .resize(W, H)
      .toBuffer();
    const buf = await sharp(await ensureReadable(raw)).jpeg({ quality: 82 }).toBuffer();
    await writeFile(`${OUT}/${key}.jpg`, buf);
    console.log(`  ${key}.jpg · ${(buf.length / 1024).toFixed(0)}KB`);
  }
}

main();

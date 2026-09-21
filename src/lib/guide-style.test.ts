// 배경지가 지켜야 할 조건 — 글자가 읽히는가.
//   npx tsx --test src/lib/guide-style.test.ts
//
// 배경을 새로 넣을 때 가장 놓치기 쉬운 것이 대비다. 예쁜 사진일수록 어두운 구석이
// 있고, 거기 글자가 걸리면 안 읽힌다. 눈으로는 매번 확인하기 어려워 여기서 잰다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { BACKDROPS, DEFAULT_GUIDE_STYLE, resolveGuideStyle, LIGHT_INK } from "./guide-style.ts";

/** 상대 휘도 (WCAG) */
function luminance(v: number) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function contrast(bg: number, fg: number) {
  const [a, b] = [luminance(bg), luminance(fg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** 회색 계열 중 **가장 옅은** 글자가 기준이다 — 본문만 재면 헤더·푸터를 놓친다 */
const TEXT_INKS: [string, string][] = [
  ["본문", LIGHT_INK.ink],
  ["라벨", LIGHT_INK.inkSoft],
  ["헤더·푸터", LIGHT_INK.inkFaint],
];

function greyOf(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

test("질감·사진 배경은 가장 어두운 곳에서도 모든 글자가 읽힌다", async () => {
  const withTexture = BACKDROPS.filter((b) => b.texture);
  assert.ok(withTexture.length > 0, "질감 배경이 하나도 없다");

  for (const b of withTexture) {
    const file = path.join(process.cwd(), "public", "guide-bg", b.texture!);
    const buf = await readFile(file); // 없으면 여기서 실패 — 목록과 파일이 어긋난 것
    const { channels } = await sharp(buf).greyscale().stats();
    for (const [role, hex] of TEXT_INKS) {
      const ratio = contrast(channels[0].min, greyOf(hex));
      assert.ok(
        ratio >= 4.5,
        `${b.label}(${b.texture}) · ${role}(${hex}) 최악 대비 ${ratio.toFixed(1)}:1 — 4.5:1 미달`
      );
    }
  }
});

test("단색 배경에서도 가장 옅은 글자가 읽힌다", () => {
  // 그라데이션은 문자열이라 픽셀을 못 재니, 가장 어두운 stop 을 뽑아 본다
  for (const b of BACKDROPS.filter((x) => !x.texture && !x.dark)) {
    const stops = b.background.match(/#[0-9a-f]{6}/gi) ?? [];
    assert.ok(stops.length > 0, `${b.label}: 색을 찾지 못했다`);
    const darkest = Math.min(...stops.map(greyOf));
    const ratio = contrast(darkest, greyOf(LIGHT_INK.inkFaint));
    assert.ok(ratio >= 4.5, `${b.label} 가장 옅은 글자 대비 ${ratio.toFixed(1)}:1 — 4.5:1 미달`);
  }
});

test("기본 배경지는 실제 목록에 있다", () => {
  assert.ok(BACKDROPS.some((b) => b.key === DEFAULT_GUIDE_STYLE.backdrop));
});

test("모르는 값은 기본값으로 떨어진다 — 설정 하나로 이미지 전체가 죽지 않게", () => {
  const r = resolveGuideStyle({ template: "없는템플릿", backdrop: "없는배경", backdropUrl: 42 });
  assert.deepEqual(r, DEFAULT_GUIDE_STYLE);
});

test("배경지 키가 겹치지 않는다", () => {
  const keys = BACKDROPS.map((b) => b.key);
  assert.equal(new Set(keys).size, keys.length);
});

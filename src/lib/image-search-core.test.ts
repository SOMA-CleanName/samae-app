import { strict as assert } from "node:assert";
import { test } from "node:test";

import { fitWithin, parseImageDataUrl } from "./image-search-core";

const dataUrl = (mime: string, bytes: number) =>
  `data:${mime};base64,${Buffer.alloc(bytes).toString("base64")}`;

test("긴 변을 512로 맞추고 비율을 지킨다", () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 512, height: 384 });
  assert.deepEqual(fitWithin(3000, 4000), { width: 384, height: 512 });
  assert.deepEqual(fitWithin(300, 200), { width: 300, height: 200 });   // 작은 사진은 그대로
  assert.deepEqual(fitWithin(0, 100), { width: 0, height: 0 });
});

test("data URL 을 쪼개고 크기를 잰다", () => {
  const parsed = parseImageDataUrl(dataUrl("image/jpeg", 900));
  assert.equal(parsed?.mime, "image/jpeg");
  assert.equal(parsed?.bytes, 900);
});

test("형식·크기·모양이 맞지 않으면 버린다", () => {
  assert.equal(parseImageDataUrl(dataUrl("image/heic", 100)), null);   // 브라우저가 못 줄인 사진
  assert.equal(parseImageDataUrl(dataUrl("text/html", 100)), null);
  assert.equal(parseImageDataUrl(dataUrl("image/jpeg", 2_000_000)), null);
  assert.equal(parseImageDataUrl("data:image/jpeg;base64,"), null);
  assert.equal(parseImageDataUrl("https://example.com/a.jpg"), null);  // 링크는 받지 않는다(docs/42 §6)
  assert.equal(parseImageDataUrl(null), null);
});

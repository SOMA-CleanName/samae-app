// 안내가 옛것인지 판단 — 틀리면 고객이 옛 금액을 보고 있어도 아무도 모른다.
//   npx tsx --test src/lib/guide-freshness.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFreshness } from "./guide-freshness.ts";

/** 기준 시각에서 분 단위로 민 ISO 문자열 */
const at = (min: number) => new Date(Date.UTC(2026, 8, 23, 12, 0, 0) + min * 60_000).toISOString();

test("카드가 아예 없으면 판단하지 않는다", () => {
  const r = checkFreshness({
    kbUpdatedAt: null,
    packagesUpdatedAt: at(0),
    profileUpdatedAt: at(0),
    imagesBuiltAt: null,
  });
  assert.equal(r.state, "none");
  assert.equal(r.label, null);
});

test("카드 → 이미지 순으로 최신이면 문제없다", () => {
  const r = checkFreshness({
    kbUpdatedAt: at(10),
    packagesUpdatedAt: at(0),
    profileUpdatedAt: at(5),
    imagesBuiltAt: at(20),
  });
  assert.equal(r.state, "fresh");
});

test("패키지가 카드보다 최신이면 카드부터 고쳐야 한다", () => {
  const r = checkFreshness({
    kbUpdatedAt: at(0),
    packagesUpdatedAt: at(60),
    profileUpdatedAt: null,
    imagesBuiltAt: at(5),
  });
  assert.equal(r.state, "cards");
  assert.match(r.label!, /카드/);
});

test("소개글만 바뀌어도 잡는다 — 최저가·소개글도 안내에 실린다", () => {
  const r = checkFreshness({
    kbUpdatedAt: at(0),
    packagesUpdatedAt: at(-100),
    profileUpdatedAt: at(60),
    imagesBuiltAt: at(5),
  });
  assert.equal(r.state, "cards");
});

test("카드와 이미지가 둘 다 밀렸으면 카드가 먼저 — 안 고치고 구우면 옛 내용이 또 나간다", () => {
  const r = checkFreshness({
    kbUpdatedAt: at(30),
    packagesUpdatedAt: at(60),
    profileUpdatedAt: null,
    imagesBuiltAt: at(0),
  });
  assert.equal(r.state, "cards");
});

test("카드만 최신이면 다시 굽기만 하면 된다", () => {
  const r = checkFreshness({
    kbUpdatedAt: at(60),
    packagesUpdatedAt: at(0),
    profileUpdatedAt: at(0),
    imagesBuiltAt: at(10),
  });
  assert.equal(r.state, "images");
  assert.match(r.label!, /이미지/);
});

test("카드는 있는데 이미지를 한 번도 안 구운 경우", () => {
  const r = checkFreshness({
    kbUpdatedAt: at(0),
    packagesUpdatedAt: null,
    profileUpdatedAt: null,
    imagesBuiltAt: null,
  });
  assert.equal(r.state, "images");
  assert.match(r.label!, /아직/);
});

test("몇 초 차이는 어긋남으로 보지 않는다 — 저장하고 바로 굽는 경로가 있다", () => {
  const r = checkFreshness({
    kbUpdatedAt: at(0),
    packagesUpdatedAt: null,
    profileUpdatedAt: null,
    // 같은 흐름에서 카드가 이미지보다 몇 초 늦게 찍힐 수 있다
    imagesBuiltAt: new Date(Date.UTC(2026, 8, 23, 12, 0, 0) - 10_000).toISOString(),
  });
  assert.equal(r.state, "fresh");
});

test("이상한 시각 문자열에 흔들리지 않는다", () => {
  const r = checkFreshness({
    kbUpdatedAt: at(0),
    packagesUpdatedAt: "어제쯤",
    profileUpdatedAt: "",
    imagesBuiltAt: at(10),
  });
  assert.equal(r.state, "fresh");
});

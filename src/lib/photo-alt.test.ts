import { test } from "node:test";
import assert from "node:assert/strict";
import { photoAlt, photoAltAt } from "./photo-alt";

test("있는 것만 말한다", () => {
  assert.equal(
    photoAlt({ location_text: "을지로 골목", mood_tags: ["필름", "감성"] }),
    "을지로 골목에서 찍은 필름 · 감성 무드 스냅 사진"
  );
  assert.equal(photoAlt({ location_text: "성수" }), "성수에서 찍은 스냅 사진");
  assert.equal(photoAlt({ mood_tags: ["빈티지"] }), "빈티지 무드 스냅 사진");
});

test("없는 사실을 만들지 않는다", () => {
  /*
    ⚠️ 문장을 채우려고 "어딘가에서 찍은" 같은 말을 넣으면 그건 지어낸 것이다.
       아무것도 없으면 아무 말도 하지 않는다.
  */
  assert.equal(photoAlt({}), "스냅 사진");
  assert.equal(photoAlt({ location_text: null, mood_tags: [] }), "스냅 사진");
  assert.equal(photoAlt({ mood_tags: ["  ", ""] }), "스냅 사진");
});

test("「협의」는 장소가 아니다", () => {
  // lib/location-text 와 같은 판정을 쓴다 — 지면에 안 쓰는 값을 alt 에 쓸 리 없다
  for (const t of ["협의", "수도권 내 협의 후 진행", "서울 어딘가", "스튜디오"]) {
    assert.equal(photoAlt({ location_text: t }), "스냅 사진", t);
  }
});

test("location_text 가 못 쓸 값이면 region 으로 떨어진다", () => {
  assert.equal(
    photoAlt({ location_text: "협의", region: "서울 성동구" }),
    "서울 성동구에서 찍은 스냅 사진"
  );
});

test("무드는 둘까지 — alt 가 태그 목록이 되면 안 된다", () => {
  /*
    alt 에 문단이나 목록을 밀어넣으면 구글이 스팸으로 본다. 한 줄이면 충분하다.
  */
  const s = photoAlt({ mood_tags: ["a", "b", "c", "d", "e"] });
  assert.equal(s, "a · b 무드 스냅 사진");
  assert.ok(s.length < 60);
});

test("작가 이름이 들어갈 자리가 없다", () => {
  // 익명 정책 — alt 는 이미지 설명이지 크레딧이 아니다
  const s = photoAlt({ location_text: "성수", mood_tags: ["감성"] });
  assert.equal(/작가|photographer/i.test(s), false);
});

test("몇 번째인지는 alt 에 넣지 않는다", () => {
  /*
    전에는 "사진 2/5" 였다. 그건 **이미지의 내용이 아니라 화면의 사정**이고,
    검색엔진에도 낭독기에도 쓸모가 없다.
  */
  const photos = [{ location_text: "성수" }, { location_text: "을지로" }];
  assert.equal(photoAltAt(photos, 0), "성수에서 찍은 스냅 사진");
  assert.equal(photoAltAt(photos, 1), "을지로에서 찍은 스냅 사진");
  assert.equal(/\d\s*\/\s*\d/.test(photoAltAt(photos, 0)), false);
  // 범위를 벗어나도 터지지 않는다
  assert.equal(photoAltAt(photos, 9), "스냅 사진");
  assert.equal(photoAltAt([], 0), "스냅 사진");
});

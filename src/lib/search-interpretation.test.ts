import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretationFrom, purposeLabel, routeLabel, EMPTY_INTERPRETATION } from "./search-interpretation";

test("무드 가족 검색 결과에서 해석을 뽑는다", () => {
  const i = interpretationFrom({
    purposes: ["couple"],
    moodText: "가을 감성",
    mood: { mode: "family", families: ["가을 스냅", "감성"], filled: ["따뜻한"] },
  });
  assert.deepEqual(i, {
    purposes: ["couple"],
    moodText: "가을 감성",
    moodMode: "family",
    moodFamilies: ["가을 스냅", "감성"],
    moodFilled: ["따뜻한"],
  });
  assert.equal(routeLabel(i), "무드 가족 · 정확");
});

test("애매한 검색은 큰 무드로 간 것으로 본다", () => {
  const i = interpretationFrom({ purposes: [], moodText: "고즈넉한", mood: { mode: "big", families: ["아늑한"] } });
  assert.equal(routeLabel(i), "큰 무드 · 애매");
  assert.deepEqual(i.moodFilled, []);
});

test("무드 가족을 안 탄 검색은 목적 · 무드로 길을 나눈다", () => {
  assert.equal(routeLabel(interpretationFrom({ purposes: ["wedding"], moodText: "" })), "목적만");
  assert.equal(routeLabel(interpretationFrom({ purposes: ["couple"], moodText: "노을" })), "목적 + 무드(벡터)");
  assert.equal(routeLabel(interpretationFrom({ purposes: [], moodText: "몽환" })), "무드(태그 + 벡터)");
  assert.equal(routeLabel(EMPTY_INTERPRETATION), "해석 없음");
});

test("검색이 실패하면(결과 없음) 빈 해석", () => {
  assert.deepEqual(interpretationFrom(null), EMPTY_INTERPRETATION);
});

test("목적 키는 이름으로, 모르는 키는 그대로", () => {
  assert.equal(purposeLabel("pet"), "반려동물");
  assert.equal(purposeLabel("unknown"), "unknown");
});

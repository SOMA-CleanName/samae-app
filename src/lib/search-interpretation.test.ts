import { test } from "node:test";
import assert from "node:assert/strict";
import { failureLabel, formatDuration, interpretationFrom, purposeLabel, routeLabel, EMPTY_INTERPRETATION } from "./search-interpretation";

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
    failure: null,
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

test("걸린 시간 — 1초 미만은 ms, 그 위는 초", () => {
  assert.equal(formatDuration(820), "820ms");
  assert.equal(formatDuration(1234), "1.2초");
  assert.equal(formatDuration(null), "—");
});

test("맥미니가 실패하면 태그만으로 찾은 것으로 본다 — 무드 글자가 있어도", () => {
  const i = interpretationFrom({ purposes: [], moodText: "시크", failure: "timeout" });
  assert.equal(i.failure, "timeout");
  assert.equal(routeLabel(i), "맥미니 실패 → 태그만");
  assert.equal(failureLabel("timeout"), "맥미니 4초 초과");
  assert.equal(failureLabel("http_401"), "맥미니 인증 실패(401 · 토큰)");
  assert.equal(failureLabel("http_502"), "맥미니 서버 오류(502)");
  assert.equal(failureLabel(null), "");
});

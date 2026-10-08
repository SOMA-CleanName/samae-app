import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_AXIS, selectScreenWords, type ScreenWord } from "./mood-screen";

const W: ScreenWord[] = [
  { w: "따뜻한", axes: ["온도", "감정"], how: "new", sure: true, why: "분위기" },
  { w: "힙한", axes: [], how: "new", sure: true, why: "스타일·감성" },
  { w: "메스껍다", axes: [], how: "flipped", sure: true, why: "기분이 몹시 좋지 않다" },
];

test("축으로 좁히거나 축 없는 것만 본다", () => {
  assert.deepEqual(selectScreenWords(W, { q: "", axis: "온도" }).map((w) => w.w), ["따뜻한"]);
  assert.deepEqual(selectScreenWords(W, { q: "", axis: NO_AXIS }).map((w) => w.w), ["힙한", "메스껍다"]);
  assert.equal(selectScreenWords(W, { q: "", axis: "" }).length, 3);
});

test("띄어쓰기만 다른 표기로도 찾는다", () => {
  const words: ScreenWord[] = [{ w: "파스텔 톤", axes: [], how: "new", sure: true, why: "색감", alt: ["파스텔톤"] }];
  assert.deepEqual(selectScreenWords(words, { q: "파스텔톤", axis: "" }).map((w) => w.w), ["파스텔 톤"]);
});

test("낱말과 판정 근거 어디에 걸려도 찾는다", () => {
  assert.deepEqual(selectScreenWords(W, { q: "힙", axis: "" }).map((w) => w.w), ["힙한"]);
  assert.deepEqual(selectScreenWords(W, { q: "기분", axis: "" }).map((w) => w.w), ["메스껍다"]);
});

import assert from "node:assert/strict";
import test from "node:test";
import { personalizedRecommendationTarget } from "./feed-personalization.ts";
import {
  canOpenInterestRecommendations,
  countInterestRecommendationCards,
  interestRecommendationRequestKey,
  toInterestRecommendationCards,
  toInterestRecommendationRows,
} from "./interest-similar-recommendations.ts";

const photo = (id: string, w = 100, h = 150) => ({
  id,
  src_url: `full-${id}`,
  thumb_url: `thumb-${id}`,
  width: w,
  height: h,
});

test("recommendations open from four distinct current interest photos", () => {
  assert.equal(canOpenInterestRecommendations(["a", "b", "c"]), false);
  assert.equal(canOpenInterestRecommendations(["a", "b", "c", "d"]), true);
  assert.equal(canOpenInterestRecommendations(["a", "a", "b", "c"]), false);
  assert.equal(canOpenInterestRecommendations(["a", "a", "b", "c", "d"]), true);
});

test("request key preserves interest order while removing duplicate ids", () => {
  assert.equal(interestRecommendationRequestKey(["old", "new", "old"]), "old|new");
});

test("four interests request 27 recommendations within the 36 maximum", () => {
  assert.equal(personalizedRecommendationTarget([], ["a", "b", "c", "d"], 36), 27);
});

test("server photos become unique cart-shaped recommendation cards", () => {
  assert.deepEqual(
    toInterestRecommendationCards([
      { id: "a", src_url: "full-a", thumb_url: "thumb-a", width: 100, height: 200 },
      { id: "a", src_url: "duplicate", thumb_url: null, width: 1, height: 1 },
      { id: "b", src_url: "full-b", thumb_url: null, width: 300, height: 200 },
    ]),
    [
      { id: "a", src: "thumb-a", w: 100, h: 200, seq: 0 },
      { id: "b", src: "full-b", w: 300, h: 200, seq: 1 },
    ]
  );
});

test("each anchor becomes its own row so a screen never mixes anchors", () => {
  const rows = toInterestRecommendationRows([
    { anchor: photo("A"), photos: [photo("a1"), photo("a2")] },
    { anchor: photo("B"), photos: [photo("b1")] },
  ]);
  assert.deepEqual(
    rows.map((row) => [row.anchor.id, row.cards.map((card) => card.id)]),
    [["A", ["a1", "a2"]], ["B", ["b1"]]]
  );
});

test("a photo shown in an earlier row is not repeated in a later one", () => {
  const rows = toInterestRecommendationRows([
    { anchor: photo("A"), photos: [photo("shared"), photo("a1")] },
    { anchor: photo("B"), photos: [photo("shared"), photo("b1")] },
  ]);
  assert.deepEqual(rows[1].cards.map((card) => card.id), ["b1"]);
});

test("a row whose photos were all taken by earlier rows is dropped", () => {
  const rows = toInterestRecommendationRows([
    { anchor: photo("A"), photos: [photo("only")] },
    { anchor: photo("B"), photos: [photo("only")] },
  ]);
  assert.deepEqual(rows.map((row) => row.anchor.id), ["A"]);
});

test("seq restarts per row so each strip animates from its own start", () => {
  const rows = toInterestRecommendationRows([
    { anchor: photo("A"), photos: [photo("a1"), photo("a2")] },
    { anchor: photo("B"), photos: [photo("b1"), photo("b2")] },
  ]);
  assert.deepEqual(rows.map((row) => row.cards.map((card) => card.seq)), [[0, 1], [0, 1]]);
});

test("header count sums the cards actually shown, not the anchors", () => {
  const rows = toInterestRecommendationRows([
    { anchor: photo("A"), photos: [photo("a1"), photo("a2")] },
    { anchor: photo("B"), photos: [photo("b1")] },
  ]);
  assert.equal(countInterestRecommendationCards(rows), 3);
  assert.equal(countInterestRecommendationCards([]), 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import { personalizedRecommendationTarget } from "./feed-personalization.ts";
import {
  canOpenInterestRecommendations,
  interestRecommendationRequestKey,
  toInterestRecommendationCards,
} from "./interest-similar-recommendations.ts";

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

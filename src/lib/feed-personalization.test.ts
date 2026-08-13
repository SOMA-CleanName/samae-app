import assert from "node:assert/strict";
import test from "node:test";
import {
  addFeedInterestSignal,
  migrateCartInterests,
  personalizedRecommendationTarget,
  removeFeedInterestSignal,
  selectPersonalizationAnchors,
} from "./feed-personalization.ts";

test("interest add records the first timestamp without duplicating or refreshing it", () => {
  const added = addFeedInterestSignal([], "photo-a", 1_000);
  const addedAgain = addFeedInterestSignal(added, "photo-a", 9_000);

  assert.deepEqual(addedAgain, [{ id: "photo-a", addedAt: 1_000 }]);
});

test("interest removal before 30 seconds undoes the recommendation signal", () => {
  const signals = [{ id: "photo-a", addedAt: 1_000 }];

  assert.deepEqual(removeFeedInterestSignal(signals, "photo-a", 30_999), []);
});

test("interest removal at 30 seconds keeps the learned recommendation signal", () => {
  const signals = [{ id: "photo-a", addedAt: 1_000 }];

  assert.deepEqual(removeFeedInterestSignal(signals, "photo-a", 31_000), signals);
});

test("legacy cart migration preserves known signals and matures missing cart photos", () => {
  const signals = [{ id: "known", addedAt: 500 }];

  assert.deepEqual(migrateCartInterests(signals, ["known", "legacy"]), [
    { id: "known", addedAt: 500 },
    { id: "legacy", addedAt: 0 },
  ]);
});

test("recommendation target follows click one plus interest two weighting", () => {
  const cases: Array<{ clicks: string[]; interests: string[]; expected: number }> = [
    { clicks: [], interests: [], expected: 0 },
    { clicks: ["a"], interests: [], expected: 6 },
    { clicks: ["a", "b"], interests: [], expected: 9 },
    { clicks: ["a", "b", "c"], interests: [], expected: 12 },
    { clicks: [], interests: ["a"], expected: 9 },
    { clicks: ["a"], interests: ["a"], expected: 12 },
    { clicks: ["a", "b"], interests: ["a"], expected: 15 },
  ];

  for (const { clicks, interests, expected } of cases) {
    assert.equal(personalizedRecommendationTarget(clicks, interests, 36), expected);
  }
});

test("recommendation target counts unique ids per signal and never exceeds the limit", () => {
  assert.equal(personalizedRecommendationTarget(["a", "a"], ["b", "b"], 36), 12);
  assert.equal(
    personalizedRecommendationTarget(
      ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7"],
      ["i0", "i1", "i2", "i3"],
      36
    ),
    36
  );
});

test("personalization anchors prefer recent interests and deduplicate clicked overlap", () => {
  assert.deepEqual(
    selectPersonalizationAnchors(
      ["click-old", "shared", "click-new"],
      ["interest-old", "shared", "interest-new"],
      4
    ),
    ["interest-new", "shared", "interest-old", "click-new"]
  );
});

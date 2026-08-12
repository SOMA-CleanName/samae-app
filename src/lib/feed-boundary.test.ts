import assert from "node:assert/strict";
import test from "node:test";

import {
  addFeedBoundary,
  limitDebugFeedPage,
  splitAtFeedBoundaries,
  type FeedBoundary,
} from "./feed-boundary.ts";

test("adding the same phase boundary twice keeps one marker", () => {
  const boundary: FeedBoundary = {
    id: "cycle-0-normal-end",
    kind: "normal-end",
    afterItemCount: 48,
  };

  assert.deepEqual(addFeedBoundary(addFeedBoundary([], boundary), boundary), [boundary]);
});

test("boundaries split photos at their recorded feed positions", () => {
  const photos = ["a", "b", "c", "d", "e"];
  const boundaries: FeedBoundary[] = [
    { id: "cycle-0-normal-end", kind: "normal-end", afterItemCount: 2 },
    { id: "cycle-0-end", kind: "cycle-end", afterItemCount: 4 },
  ];

  assert.deepEqual(splitAtFeedBoundaries(photos, boundaries), [
    { items: ["a", "b"], boundary: boundaries[0] },
    { items: ["c", "d"], boundary: boundaries[1] },
    { items: ["e"] },
  ]);
});

test("a restored boundary beyond the currently visible prefix waits for its photos", () => {
  const boundary: FeedBoundary = {
    id: "cycle-0-normal-end",
    kind: "normal-end",
    afterItemCount: 4,
  };

  assert.deepEqual(splitAtFeedBoundaries(["a", "b"], [boundary]), [
    { items: ["a", "b"] },
  ]);
});

test("debug feed keeps one 48-photo normal page and one 24-photo demoted page", () => {
  const photos = Array.from({ length: 60 }, (_, index) => index);

  assert.equal(limitDebugFeedPage("normal", 0, photos).length, 48);
  assert.deepEqual(limitDebugFeedPage("normal", 1, photos), []);
  assert.equal(limitDebugFeedPage("demoted", 0, photos).length, 24);
  assert.deepEqual(limitDebugFeedPage("demoted", 1, photos), []);
});

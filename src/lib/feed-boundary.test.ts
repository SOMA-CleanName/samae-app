import assert from "node:assert/strict";
import test from "node:test";

import { addFeedBoundary, splitAtFeedBoundaries, type FeedBoundary } from "./feed-boundary.ts";

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

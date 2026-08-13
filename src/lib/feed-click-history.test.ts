import assert from "node:assert/strict";
import test from "node:test";
import { appendFeedClick, clearFeedClicks, FEED_CLICK_HISTORY_KEY } from "./feed-click-history.ts";

test("click history keeps unique ids in first-click order", () => {
  assert.deepEqual(appendFeedClick(["a", "b"], "a"), ["a", "b"]);
  assert.deepEqual(appendFeedClick(["a", "b"], "c"), ["a", "b", "c"]);
});

test("click history keeps only the most recent eight unique ids", () => {
  const previous = Array.from({ length: 8 }, (_, index) => `p${index}`);
  assert.deepEqual(appendFeedClick(previous, "p8"), [...previous.slice(1), "p8"]);
});

test("custom history limit is deterministic", () => {
  assert.deepEqual(appendFeedClick(["a", "b", "c"], "d", 2), ["c", "d"]);
});

test("clearing feed clicks removes the shared history key", () => {
  const removed: string[] = [];
  clearFeedClicks({ removeItem: (key) => removed.push(key) });
  assert.deepEqual(removed, [FEED_CLICK_HISTORY_KEY]);
});

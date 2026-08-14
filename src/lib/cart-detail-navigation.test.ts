import assert from "node:assert/strict";
import test from "node:test";
import {
  circularPhotoId,
  reconciledFocusedPhotoId,
  shouldShowCartSwipeHint,
  verticalSwipeDirection,
  wheelNavigationDirection,
} from "./cart-detail-navigation.ts";

test("next and previous move to adjacent photos", () => {
  const ids = ["a", "b", "c"];

  assert.equal(circularPhotoId(ids, "b", "next"), "c");
  assert.equal(circularPhotoId(ids, "b", "previous"), "a");
});

test("next wraps from the last photo to the first", () => {
  assert.equal(circularPhotoId(["a", "b", "c"], "c", "next"), "a");
});

test("previous wraps from the first photo to the last", () => {
  assert.equal(circularPhotoId(["a", "b", "c"], "a", "previous"), "c");
});

test("navigation is disabled for fewer than two photos", () => {
  assert.equal(circularPhotoId([], "a", "next"), null);
  assert.equal(circularPhotoId(["a"], "a", "next"), null);
});

test("a missing current photo recovers to the first photo", () => {
  assert.equal(circularPhotoId(["a", "b"], "missing", "next"), "a");
});

test("vertical swipe accepts dominant upward and downward movement beyond 56px", () => {
  assert.equal(verticalSwipeDirection(10, 100, 18, 40), "next");
  assert.equal(verticalSwipeDirection(10, 40, 14, 100), "previous");
});

test("vertical swipe ignores short and horizontally dominant movement", () => {
  assert.equal(verticalSwipeDirection(10, 100, 10, 45), null);
  assert.equal(verticalSwipeDirection(10, 100, 50, 60), null);
  assert.equal(verticalSwipeDirection(10, 100, 80, 40), null);
});

test("swipe hint appears only for multiple photos before it has been seen", () => {
  assert.equal(shouldShowCartSwipeHint(2, false), true);
  assert.equal(shouldShowCartSwipeHint(1, false), false);
  assert.equal(shouldShowCartSwipeHint(3, true), false);
});

test("focused photo reconciliation preserves valid ids and recovers removed ids", () => {
  assert.equal(reconciledFocusedPhotoId(["a", "b"], "b"), "b");
  assert.equal(reconciledFocusedPhotoId(["a", "b"], "removed"), "a");
  assert.equal(reconciledFocusedPhotoId([], "removed"), null);
});

test("wheel navigation normalizes pixel and line deltas", () => {
  assert.equal(wheelNavigationDirection(0, 24, 0), "next");
  assert.equal(wheelNavigationDirection(0, -24, 0), "previous");
  assert.equal(wheelNavigationDirection(0, 2, 1), "next");
});

test("wheel navigation ignores small and horizontally dominant movement", () => {
  assert.equal(wheelNavigationDirection(0, 10, 0), null);
  assert.equal(wheelNavigationDirection(40, 30, 0), null);
});

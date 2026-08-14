import assert from "node:assert/strict";
import test from "node:test";
import { circularPhotoId, verticalSwipeDirection } from "./cart-detail-navigation.ts";

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

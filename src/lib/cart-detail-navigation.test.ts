import assert from "node:assert/strict";
import test from "node:test";
import {
  cartMetaLabels,
  circularPhotoId,
  reconciledFocusedPhotoId,
  shouldShowCartSwipeHint,
  horizontalSwipeDirection,
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

test("horizontal swipe accepts dominant upward and downward movement beyond 56px", () => {
  assert.equal(horizontalSwipeDirection(100, 10, 30, 18), "next");
  assert.equal(horizontalSwipeDirection(40, 10, 110, 14), "previous");
});

test("horizontal swipe ignores short and horizontally dominant movement", () => {
  assert.equal(horizontalSwipeDirection(100, 10, 55, 10), null);
  assert.equal(horizontalSwipeDirection(100, 10, 60, 50), null);
  assert.equal(horizontalSwipeDirection(100, 10, 40, 80), null);
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

test("wheel navigation ignores small movement and follows the dominant axis", () => {
  assert.equal(wheelNavigationDirection(0, 10, 0), null);
  assert.equal(wheelNavigationDirection(10, 8, 0), null);
  // 가로가 우세하면 가로를 따른다(트랙패드).
  assert.equal(wheelNavigationDirection(40, 30, 0), "next");
  assert.equal(wheelNavigationDirection(-40, 30, 0), "previous");
});

test("missing price and location use one negotiation headline", () => {
  assert.deepEqual(cartMetaLabels(null, null), {
    primaryText: "가격, 장소 협의",
    locationText: null,
  });
});

test("missing price keeps the real location", () => {
  assert.deepEqual(cartMetaLabels(null, "잠실야구장"), {
    primaryText: "가격 협의",
    locationText: "잠실야구장",
  });
});

test("missing location keeps the real price", () => {
  assert.deepEqual(cartMetaLabels("₩220,000", null), {
    primaryText: "₩220,000",
    locationText: "장소 협의",
  });
});

test("provided price and location remain unchanged", () => {
  assert.deepEqual(cartMetaLabels("₩220,000", "잠실야구장"), {
    primaryText: "₩220,000",
    locationText: "잠실야구장",
  });
});

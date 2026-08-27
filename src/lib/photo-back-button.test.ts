import assert from "node:assert/strict";
import test from "node:test";
import * as backButton from "./photo-back-button.ts";

test("keeps back navigation fixed regardless of detail search visibility", () => {
  assert.equal(backButton.getPhotoBackButtonMode(true), "floating");
  assert.equal(backButton.getPhotoBackButtonMode(false), "floating");
});

test("uses browser history when available and falls back to home for direct entry", () => {
  assert.equal(backButton.getBackNavigationAction?.(2), "history");
  assert.equal(backButton.getBackNavigationAction?.(1), "home");
  assert.equal(backButton.getBackNavigationAction?.(0), "home");
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  PURPOSE_OPTIONS,
  isPurposeKey,
  purposeLabel,
} from "./photo-purpose";

test("purpose contract exposes exactly the approved stable codes", () => {
  assert.deepEqual(
    PURPOSE_OPTIONS.map((option) => option.key),
    [
      "personal",
      "couple",
      "friendship",
      "wedding",
      "pet",
      "commercial",
      "event",
    ],
  );
});

test("purpose keys reject unapproved categories", () => {
  assert.equal(isPurposeKey("wedding"), true);
  assert.equal(isPurposeKey("graduation"), false);
  assert.equal(isPurposeKey(null), false);
});

test("purpose labels expose the approved Korean admin copy", () => {
  assert.equal(purposeLabel("commercial"), "상업/브랜드");
  assert.equal(purposeLabel("friendship"), "우정");
});

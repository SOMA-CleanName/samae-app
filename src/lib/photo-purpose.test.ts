import assert from "node:assert/strict";
import test from "node:test";

import {
  PURPOSE_OPTIONS,
  isPurposeKey,
  purposeLabel,
  normalizePurposes,
  parsePurposeSelection,
  togglePurpose,
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

test("multiple purposes preserve order and existing single-purpose data", () => {
  assert.deepEqual(normalizePurposes(["wedding", "pet", "wedding"]), ["wedding", "pet"]);
  assert.deepEqual(normalizePurposes(undefined, "wedding"), ["wedding"]);
  assert.deepEqual(normalizePurposes([], "wedding"), []);
  assert.deepEqual(normalizePurposes(null, null), []);
});

test("selection adds a purpose without replacing others and toggles it off", () => {
  const original = ["wedding"] as const;
  const combined = togglePurpose(original, "pet");
  assert.deepEqual(combined, ["wedding", "pet"]);
  assert.deepEqual(togglePurpose(combined, "wedding"), ["pet"]);
  assert.deepEqual(togglePurpose(togglePurpose(combined, "wedding"), "wedding"), ["pet", "wedding"]);
  assert.deepEqual(togglePurpose(["pet"], "pet"), []);
  assert.deepEqual(original, ["wedding"]);
});

test("saving requires at least one approved purpose and rejects mixed invalid input", () => {
  assert.deepEqual(parsePurposeSelection(["wedding", "pet", "wedding"]), ["wedding", "pet"]);
  for (const value of [[], null, "wedding", ["wedding", "unknown"], ["pet", null]]) {
    assert.throws(() => parsePurposeSelection(value));
  }
});

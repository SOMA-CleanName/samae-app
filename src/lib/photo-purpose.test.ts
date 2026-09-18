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

test("성별은 개인 목적이 있을 때만 산다", async () => {
  const { genderFor, parseGenderSelection, purposeChipLabel } = await import("./photo-purpose.ts");
  assert.equal(genderFor(["personal"], "male"), "male");
  assert.equal(genderFor(["couple"], "male"), null, "커플에는 성별이 없다");
  assert.equal(genderFor(["personal", "pet"], "female"), "female");
  assert.equal(genderFor(["personal"], undefined), null);
  assert.equal(parseGenderSelection(null), null);
  assert.equal(parseGenderSelection("female"), "female");
  assert.throws(() => parseGenderSelection("other"));
  assert.equal(purposeChipLabel("personal", "female"), "개인·여성");
  assert.equal(purposeChipLabel("couple", "female"), "커플");
});

test("세부분류는 그 목적이 있을 때만 산다", async () => {
  const { PURPOSE_DETAILS, detailsFor, detailLabel, parseDetailSelection, toggleDetail } = await import("./photo-purpose.ts");
  assert.deepEqual(PURPOSE_DETAILS.event.map((d) => d.label), ["만삭", "아기", "돌", "가족", "졸업", "단체·동호회", "연회"]);
  assert.deepEqual(PURPOSE_DETAILS.personal.map((d) => d.value), [
    "personal.snap", "personal.profile", "personal.body_profile", "personal.id_photo",
  ]);
  assert.deepEqual(detailsFor(["event"], ["event.maternity", "wedding.ceremony", "event.maternity"]), ["event.maternity"]);
  assert.equal(detailLabel("event.first_birthday"), "돌");
  assert.throws(() => parseDetailSelection(["event.party"]));
  assert.deepEqual(parseDetailSelection([]), []);
  assert.deepEqual(toggleDetail(["event.baby"], "event.baby"), []);
});

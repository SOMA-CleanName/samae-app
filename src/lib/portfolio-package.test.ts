import assert from "node:assert/strict";
import test from "node:test";

import { normalizePhotoText, resolvePackageSelection } from "./portfolio-package";

const packages = [
  { id: "pkg-couple", name: "커플 스냅", price_krw: 90_000 },
  { id: "pkg-wedding", name: "웨딩 스냅", price_krw: 150_000 },
];

test("package selection returns the real package id and its price snapshot", () => {
  assert.deepEqual(resolvePackageSelection(packages, "pkg-couple"), {
    packageId: "pkg-couple",
    priceKrw: 90_000,
  });
});

test("empty package selection clears both package and price", () => {
  assert.deepEqual(resolvePackageSelection(packages, ""), {
    packageId: null,
    priceKrw: null,
  });
});

test("unknown package ids are rejected instead of guessing by price", () => {
  assert.throws(
    () => resolvePackageSelection(packages, "missing"),
    /선택한 패키지를 찾을 수 없습니다/,
  );
});

test("package selection trims the submitted id", () => {
  assert.deepEqual(resolvePackageSelection(packages, "  pkg-wedding  "), {
    packageId: "pkg-wedding",
    priceKrw: 150_000,
  });
});

test("photo text trims values and enforces database lengths", () => {
  assert.deepEqual(
    normalizePhotoText(`  ${"제".repeat(130)}  `, `  ${"설".repeat(1010)}  `),
    {
      title: "제".repeat(120),
      caption: "설".repeat(1000),
    },
  );
});

test("blank photo text is stored as null", () => {
  assert.deepEqual(normalizePhotoText("  ", "\n"), { title: null, caption: null });
});

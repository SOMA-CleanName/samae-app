import assert from "node:assert/strict";
import test from "node:test";
import { groupCartMetaSamples, type CartMetaSample } from "./cart-meta-dev.ts";

function sample(
  id: string,
  fields: Partial<Pick<CartMetaSample, "price_krw" | "location_text" | "region">> = {}
): CartMetaSample {
  return {
    id,
    src_url: `https://example.com/${id}.jpg`,
    thumb_url: null,
    width: 1200,
    height: 1800,
    price_krw: null,
    location_text: null,
    region: null,
    ...fields,
  };
}

test("location-only samples prefer location text and fall back to region", () => {
  const groups = groupCartMetaSamples([
    sample("location-text", { location_text: " 잠실야구장 ", region: "서울" }),
    sample("region", { region: "부산" }),
    sample("both", { price_krw: 120000, location_text: "제주" }),
  ]);

  assert.deepEqual(
    groups.locationOnly.map(({ id, location }) => ({ id, location })),
    [
      { id: "location-text", location: "잠실야구장" },
      { id: "region", location: "부산" },
    ]
  );
});

test("price-only and fully missing samples go to separate groups", () => {
  const groups = groupCartMetaSamples([
    sample("price-only", { price_krw: 90000 }),
    sample("neither"),
    sample("blank-place", { location_text: "  ", region: " " }),
  ]);

  assert.deepEqual(groups.priceOnly.map(({ id }) => id), ["price-only"]);
  assert.deepEqual(groups.neither.map(({ id }) => id), ["neither", "blank-place"]);
});

test("each QA group keeps at most the requested number of samples", () => {
  const rows = Array.from({ length: 6 }, (_, index) =>
    sample(`location-${index}`, { region: `지역 ${index}` })
  );

  const groups = groupCartMetaSamples(rows, 4);

  assert.deepEqual(groups.locationOnly.map(({ id }) => id), [
    "location-0",
    "location-1",
    "location-2",
    "location-3",
  ]);
});

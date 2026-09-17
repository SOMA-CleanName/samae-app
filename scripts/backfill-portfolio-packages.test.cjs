const assert = require("node:assert/strict");
const test = require("node:test");
const { planPackageLinks } = require("./backfill-portfolio-packages.cjs");

const album = {
  id: "a1", photographer_id: "owner1", package_id: null, price_krw: null,
  photo_count: 2, priced_photo_count: 2, photo_prices: [120000],
};
const packages = [
  { id: "p1", photographer_id: "owner1", name: "Couple", price_krw: 120000 },
  { id: "p2", photographer_id: "owner2", name: "Other owner", price_krw: 120000 },
];

test("links only the unique same-owner package matching every photo price", () => {
  const [item] = planPackageLinks([album], packages);
  assert.equal(item.reason, "matched");
  assert.equal(item.target_package_id, "p1");
  assert.equal(item.target_price_krw, 120000);
  assert.equal(album.package_id, null);
});

test("same-priced packages are ambiguous even if one is inactive", () => {
  const [item] = planPackageLinks([album], [
    ...packages,
    { ...packages[0], id: "p3", is_active: false },
  ]);
  assert.equal(item.reason, "ambiguous_price");
  assert.equal(item.target_package_id, null);
  assert.deepEqual(item.matching_packages.map((p) => p.id), ["p1", "p3"]);
});

test("existing links, missing prices, mixed prices, and missing photos stay unchanged", () => {
  const cases = [
    [{ package_id: "existing" }, "already_linked"],
    [{ photo_count: 0, priced_photo_count: 0, photo_prices: [] }, "no_photos"],
    [{ priced_photo_count: 0, photo_prices: [] }, "no_price"],
    [{ priced_photo_count: 1 }, "inconsistent_photo_prices"],
    [{ photo_prices: [90000, 120000] }, "inconsistent_photo_prices"],
    [{ price_krw: 90000 }, "album_photo_price_conflict"],
  ];
  for (const [changes, reason] of cases) {
    const [item] = planPackageLinks([{ ...album, ...changes }], packages);
    assert.equal(item.reason, reason);
    assert.equal(item.target_package_id, null);
  }
});

test("another photographer's matching price never supplies a missing package", () => {
  const [item] = planPackageLinks([album], [packages[1]]);
  assert.equal(item.reason, "no_matching_package");
  assert.equal(item.target_package_id, null);
});

test("existing internal assignments are preserved even when a price match suggests something else", () => {
  const [item] = planPackageLinks([{ ...album, admin_package_id: "manually-assigned" }], packages);
  assert.equal(item.reason, "already_internal");
  assert.equal(item.target_package_id, null);
});

test("zero is a stored price and remains distinguishable from a missing price", () => {
  const [item] = planPackageLinks([{ ...album, photo_prices: [0] }], [{ ...packages[0], price_krw: 0 }]);
  assert.equal(item.reason, "matched");
  assert.equal(item.target_price_krw, 0);
});

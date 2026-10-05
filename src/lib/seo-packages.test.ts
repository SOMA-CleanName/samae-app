import { test } from "node:test";
import assert from "node:assert/strict";
import { packagesJsonLd } from "./seo";

const PKGS = [
  { id: "a", name: "성수 스냅 30분", price_krw: 120000, description: "골목 위주" },
  { id: "b", name: "가격 미정 패키지", price_krw: null },
];

/** ItemList 안의 첫 아이템 */
const first = (ld: unknown) =>
  ((ld as { itemListElement: Array<{ item: Record<string, unknown> }> }).itemListElement[0]
    .item) as Record<string, unknown>;

test("촬영은 Product 가 아니라 Service 다", () => {
  /*
    2026-09-24. Product 로 내보냈더니 구글이 **판매자 목록(merchant listing)** 규칙을
    적용해 배송·반품·GTIN 을 요구했다. 촬영은 배송되지도 반품되지도 않는다.
    맞추려고 반품정책을 적으면 **없는 사실을 공표**하게 된다.

    이 테스트는 누가 Product 로 되돌리는 걸 막는다 — 되돌리려면 이 테스트를 고치게 되고,
    그때 "배송·반품을 정말 제공하나" 를 다시 묻게 된다.
  */
  const item = first(packagesJsonLd("ph-1", PKGS)!);
  assert.equal(item["@type"], "Service");
  assert.equal("category" in item, false, "category 는 상품 택소노미 칸이다 — 무효로 잡혔다");
  assert.equal(item.serviceType, "사진 촬영");
});

test("가격은 그대로 실린다 — 이 구조가 존재하는 이유다", () => {
  // "성수 스냅 얼마?" 에 우리가 답이 되는 게 목적이라 Offer 가 빠지면 의미가 없다
  const offers = first(packagesJsonLd("ph-1", PKGS)!).offers as Record<string, unknown>;
  assert.equal(offers["@type"], "Offer");
  assert.equal(offers.price, 120000);
  assert.equal(offers.priceCurrency, "KRW");
});

test("가격 없는 패키지는 빠진다", () => {
  // Offer 에 price 가 없으면 무효 구조라 경고가 뜬다
  const ld = packagesJsonLd("ph-1", PKGS) as { itemListElement: unknown[] };
  assert.equal(ld.itemListElement.length, 1);
  assert.equal(packagesJsonLd("ph-1", [{ id: "x", name: "무료", price_krw: null }]), null);
});

test("대표 사진을 넣는다 — image 누락이 유일한 '심각' 이었다", () => {
  const withImg = first(packagesJsonLd("ph-1", PKGS, { imageUrl: "https://cdn/x.jpg" })!);
  assert.equal(withImg.image, "https://cdn/x.jpg");
  // 사진이 없는 작가에게 빈 image 를 내보내면 그것도 무효다
  assert.equal("image" in first(packagesJsonLd("ph-1", PKGS, { imageUrl: null })!), false);
});

test("후기가 없으면 별점을 만들지 않는다", () => {
  /*
    rating_avg 는 후기가 0건이면 0 이다. 그대로 실으면 **별 0개짜리 서비스**를
    공표하는 꼴이 된다. 신규 작가가 대부분 0건이라 실제로 벌어질 일이었다.
  */
  for (const opts of [
    { ratingAvg: 0, reviewCount: 0 },
    { ratingAvg: 4.8, reviewCount: 0 },
    { ratingAvg: 0, reviewCount: 3 },
    {},
  ]) {
    assert.equal(
      "aggregateRating" in first(packagesJsonLd("ph-1", PKGS, opts)!),
      false,
      `별점이 새어 나갔다: ${JSON.stringify(opts)}`
    );
  }
});

test("후기가 있으면 별점을 싣는다", () => {
  const item = first(packagesJsonLd("ph-1", PKGS, { ratingAvg: 4.8, reviewCount: 12 })!);
  assert.deepEqual(item.aggregateRating, {
    "@type": "AggregateRating",
    ratingValue: 4.8,
    reviewCount: 12,
  });
});

test("작가 실명은 어디에도 안 들어간다", () => {
  // 익명 정책 — provider·seller 는 브랜드다
  const item = first(packagesJsonLd("ph-1", PKGS, { imageUrl: "https://cdn/x.jpg" })!);
  const json = JSON.stringify(item);
  assert.equal((item.provider as { "@type": string })["@type"], "Organization");
  assert.equal(((item.offers as Record<string, unknown>).seller as { "@type": string })["@type"], "Organization");
  assert.ok(!/photographer_name|displayName/i.test(json));
});

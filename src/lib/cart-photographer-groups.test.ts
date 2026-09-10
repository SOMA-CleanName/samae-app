import assert from "node:assert/strict";
import test from "node:test";
import {
  UNKNOWN_PHOTOGRAPHER,
  cartOwnerMap,
  groupCartByPhotographer,
  groupDisplayName,
  groupInquiryPhotoId,
  groupPriceText,
  hasPhotographerGroups,
  rowItems,
} from "./cart-photographer-groups.ts";

const item = (id: string) => ({ id, src: `src-${id}`, w: 100, h: 150 });
const owners = cartOwnerMap([
  { photoId: "a", photographerId: "kim", displayName: "김작가", priceFromKrw: 150000 },
  { photoId: "b", photographerId: "lee", displayName: "이작가", priceFromKrw: 0 },
  { photoId: "c", photographerId: "kim", displayName: "김작가", priceFromKrw: 150000 },
  { photoId: "d", photographerId: "lee", displayName: null, priceFromKrw: null },
  { photoId: "e", photographerId: "park", displayName: "박작가", priceFromKrw: 90000 },
]);

test("많이 담은 작가가 위, 같은 장수면 최근에 담은 작가가 위", () => {
  // kim 2장 / lee 1장 — 담기는 lee 가 더 최근이어도 장수가 앞선다.
  assert.deepEqual(
    groupCartByPhotographer(["a", "c", "b"].map(item), owners).map((g) => [
      g.photographerId,
      g.items.map((i) => i.id),
    ]),
    [
      ["kim", ["a", "c"]],
      ["lee", ["b"]],
    ]
  );
  // 둘 다 1장 — 나중에 담은 park 가 위로.
  assert.deepEqual(
    groupCartByPhotographer(["a", "e"].map(item), owners).map((g) => g.photographerId),
    ["park", "kim"]
  );
});

test("작가를 못 찾은 사진은 한 줄로 모여 맨 뒤", () => {
  const groups = groupCartByPhotographer(["a", "zz", "yy", "xx", "b"].map(item), owners);
  assert.deepEqual(groups.map((g) => g.photographerId), [
    "lee",
    "kim",
    UNKNOWN_PHOTOGRAPHER,
  ]);
  // 3장으로 가장 많아도 작가 미상은 맨 뒤에 둔다.
  assert.deepEqual(groups[2].items.map((i) => i.id), ["zz", "yy", "xx"]);
  assert.equal(groupDisplayName(groups[2]), "작가 미상");
});

test("작가를 하나도 못 받아오면 줄로 묶지 않는다", () => {
  assert.equal(hasPhotographerGroups([]), false);
  assert.equal(hasPhotographerGroups(groupCartByPhotographer([item("a")], owners)), true);
});

test("이름이 비어도 줄은 유지된다", () => {
  const groups = groupCartByPhotographer([item("d")], owners);
  assert.equal(groups[0].photographerId, "lee");
  assert.equal(groupDisplayName(groups[0]), "작가 미상");
});

test("줄 안에서는 최근에 담은 사진이 왼쪽", () => {
  const group = groupCartByPhotographer(["a", "c"].map(item), owners)[0];
  assert.deepEqual(rowItems(group).map((i) => i.id), ["c", "a"]);
  // 원본은 건드리지 않는다.
  assert.deepEqual(group.items.map((i) => i.id), ["a", "c"]);
});

test("줄 문의는 그 작가의 가장 최근 관심사진으로 들어간다", () => {
  const group = groupCartByPhotographer(["a", "c"].map(item), owners)[0];
  assert.equal(groupInquiryPhotoId(group), "c");
  assert.equal(groupInquiryPhotoId({ photographerId: "x", displayName: null, priceFromKrw: null, items: [] }), null);
});

test("최소 촬영 금액은 있을 때만, 0원·미입력은 표시하지 않는다", () => {
  const [kim] = groupCartByPhotographer([item("a")], owners);
  assert.equal(groupPriceText(kim), "150,000원~");
  // 0원(미입력)도, 값이 아예 없는 것도 표시하지 않는다.
  assert.equal(groupPriceText(groupCartByPhotographer([item("b")], owners)[0]), null);
  assert.equal(groupPriceText(groupCartByPhotographer([item("d")], owners)[0]), null);
  // 작가를 못 찾은 줄에도 금액이 없다.
  assert.equal(groupPriceText(groupCartByPhotographer([item("zz")], owners)[0]), null);
});

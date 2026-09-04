import assert from "node:assert/strict";
import test from "node:test";
import {
  UNKNOWN_PHOTOGRAPHER,
  cartOwnerMap,
  groupCartByPhotographer,
  groupDisplayName,
  groupInquiryPhotoId,
  pileCoverItems,
  reconciledActiveGroupId,
  shouldShowPhotographerPiles,
  visibleCartItems,
} from "./cart-photographer-groups.ts";

const item = (id: string) => ({ id, src: `src-${id}`, w: 100, h: 150 });
const owners = cartOwnerMap([
  { photoId: "a", photographerId: "kim", displayName: "김작가" },
  { photoId: "b", photographerId: "lee", displayName: "이작가" },
  { photoId: "c", photographerId: "kim", displayName: "김작가" },
  { photoId: "d", photographerId: "lee", displayName: null },
]);

test("가장 최근에 담은 사진의 작가가 첫 더미", () => {
  const groups = groupCartByPhotographer(["a", "b", "c"].map(item), owners);
  assert.deepEqual(
    groups.map((g) => [g.photographerId, g.items.map((i) => i.id)]),
    [
      ["kim", ["a", "c"]],
      ["lee", ["b"]],
    ]
  );
});

test("작가를 못 찾은 사진은 한 더미로 모여 맨 뒤", () => {
  const groups = groupCartByPhotographer(["a", "zz", "b", "yy"].map(item), owners);
  assert.deepEqual(groups.map((g) => g.photographerId), ["lee", "kim", UNKNOWN_PHOTOGRAPHER]);
  assert.deepEqual(groups[2].items.map((i) => i.id), ["zz", "yy"]);
  assert.equal(groupDisplayName(groups[2]), "작가 미상");
});

test("작가가 한 명뿐이면 더미 화면을 건너뛴다", () => {
  assert.equal(shouldShowPhotographerPiles(groupCartByPhotographer([item("a")], owners)), false);
  assert.equal(
    shouldShowPhotographerPiles(groupCartByPhotographer(["a", "b"].map(item), owners)),
    true
  );
});

test("이름이 비어도 작가 더미는 유지된다", () => {
  const groups = groupCartByPhotographer([item("d")], owners);
  assert.equal(groups[0].photographerId, "lee");
  assert.equal(groupDisplayName(groups[0]), "작가 미상");
});

test("열어둔 작가가 사라지면 더미 화면으로 되돌린다", () => {
  const groups = groupCartByPhotographer(["a", "c"].map(item), owners);
  assert.equal(reconciledActiveGroupId(groups, "kim"), "kim");
  assert.equal(reconciledActiveGroupId(groups, "lee"), null);
  assert.equal(reconciledActiveGroupId(groups, null), null);
});

test("더미 화면은 전부, 작가를 열면 그 작가 사진만 그린다", () => {
  const items = ["a", "b", "c"].map(item);
  const groups = groupCartByPhotographer(items, owners);
  assert.deepEqual(visibleCartItems(groups, null, items).map((i) => i.id), ["a", "c", "b"]);
  assert.deepEqual(visibleCartItems(groups, "kim", items).map((i) => i.id), ["a", "c"]);
  // 아직 작가를 못 받아온 동안에는 카트 원본을 그대로 쓴다.
  assert.deepEqual(visibleCartItems([], null, items).map((i) => i.id), ["a", "b", "c"]);
});

test("더미 표지는 최근 3장, 맨 위가 가장 최근", () => {
  const group = groupCartByPhotographer(["a", "c"].map(item), owners)[0];
  assert.deepEqual(pileCoverItems(group).map((i) => i.id), ["c", "a"]);

  const many = {
    photographerId: "kim",
    displayName: "김작가",
    items: ["1", "2", "3", "4", "5"].map(item),
  };
  assert.deepEqual(pileCoverItems(many).map((i) => i.id), ["5", "4", "3"]);
});

test("작가 문의는 그 작가의 가장 최근 관심사진으로 들어간다", () => {
  const group = groupCartByPhotographer(["a", "c"].map(item), owners)[0];
  assert.equal(groupInquiryPhotoId(group), "c");
  assert.equal(groupInquiryPhotoId({ photographerId: "x", displayName: null, items: [] }), null);
});

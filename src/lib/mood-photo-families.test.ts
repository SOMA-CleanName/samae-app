import assert from "node:assert/strict";
import { test } from "node:test";
import { familyLabel, latestFamilyNames, moodTally, selectFamilies, type PhotoFamilies, type PhotoFamily } from "./mood-photo-families";

const fam = (id: string, big: string, members: string[], axes: [string, number][] = [], guests: PhotoFamily["guests"] = []): PhotoFamily =>
  ({ id, big, members, terms: members.length * 2, axes, guests });

const F: PhotoFamily[] = [
  fam("f01", "m01", ["노을", "골든 아워"], [["빛", 2], ["시간대", 1]], [{ head: "가을 햇살", home: "f02", share: 0.7 }]),
  fam("f02", "m01", ["가을 햇살", "단풍"], [["계절·날씨", 2]]),
  fam("f03", "m02", ["도시 불빛"], [["공간", 1]]),
];
const DATA: PhotoFamilies = {
  made_at: "2026-09-29", resolution: 8, big_resolution: 2, weights: {}, families: F,
  moods: [{ id: "m01", families: ["f01", "f02"] }, { id: "m02", families: ["f03"] }],
};

test("이름은 마지막 줄이 이기고, 빈 이름은 지우기다", () => {
  const names = latestFamilyNames([
    { id: "f01", name: "해질녘 빛", at: "1" },
    { id: "f02", name: "가을", at: "2" },
    { id: "f01", name: "노을빛", at: "3" },
    { id: "f02", name: "  ", at: "4" },
  ]);
  assert.equal(names.get("f01"), "노을빛");
  assert.equal(names.has("f02"), false, "빈 이름을 보내면 이름이 사라진다");
});

test("이름이 없으면 번호로 보여 준다 — 식구 하나를 대표로 세우지 않는다", () => {
  const names = latestFamilyNames([{ id: "f01", name: "노을빛", at: "1" }]);
  assert.equal(familyLabel(F[0], names), "노을빛");
  assert.equal(familyLabel(F[2], names), "F03");
});

test("큰 무드 · 축 · 검색으로 거른다 — 검색은 가족 이름 · 식구 묶음 · 손님에 걸린다", () => {
  const names = latestFamilyNames([{ id: "f03", name: "도시 밤", at: "1" }]);
  const ids = (o: Parameters<typeof selectFamilies>[2]) => selectFamilies(F, names, o).map((f) => f.id);
  assert.deepEqual(ids({ big: "m01" }), ["f01", "f02"]);
  assert.deepEqual(ids({ axis: "빛" }), ["f01"]);
  assert.deepEqual(ids({ q: "단풍" }), ["f02"], "식구 묶음 이름");
  assert.deepEqual(ids({ q: "도시 밤" }), ["f03"], "사람이 붙인 이름");
  assert.deepEqual(ids({ q: "가을 햇살" }), ["f01", "f02"], "손님으로 걸친 가족도 나온다");
  assert.deepEqual(ids({}), ["f01", "f02", "f03"]);
});

test("큰 무드마다 가족 · 묶음 · 검색어 수를 센다", () => {
  assert.deepEqual(moodTally(DATA), [
    { id: "m01", families: 2, groups: 4, terms: 8 },
    { id: "m02", families: 1, groups: 1, terms: 2 },
  ]);
});

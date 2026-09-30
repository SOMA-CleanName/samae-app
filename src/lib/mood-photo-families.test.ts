import assert from "node:assert/strict";
import { test } from "node:test";
import { familyLabel, moodTally, noteFor, selectFamilies, type PhotoFamilies, type PhotoFamily, type PhotoFamilyNote } from "./mood-photo-families";

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

const NOTES: PhotoFamilyNote[] = [
  { members: ["노을", "골든 아워"], note: "해가 만드는 시간대의 빛" },
  { members: ["도시 불빛", "네온"], note: "밤 도시의 불빛" },
];

test("글은 번호가 아니라 식구 겹침으로 짝짓는다 — 다시 뭉쳐 번호가 바뀌어도 따라간다", () => {
  assert.deepEqual(noteFor(F[0], NOTES), { note: "해가 만드는 시간대의 빛", changed: false });
  assert.deepEqual(noteFor({ members: ["노을", "골든 아워", "일몰"] }, NOTES), { note: "해가 만드는 시간대의 빛", changed: true }, "식구가 늘면 옛 글이라고 알린다");
  assert.deepEqual(noteFor(F[2], NOTES), { note: "밤 도시의 불빛", changed: true }, "겹침 1/2 은 문턱에 걸친다");
  assert.equal(noteFor(F[1], NOTES), null, "겹치는 식구가 없으면 글이 없다");
  assert.equal(noteFor({ members: ["노을", "a", "b", "c"] }, NOTES), null, "조금만 겹치면 남의 글을 붙이지 않는다");
});

test("표시는 번호뿐이다 — 식구 하나를 대표로 세우지 않는다", () => {
  assert.equal(familyLabel(F[2]), "F03");
});

test("큰 무드 · 축 · 검색으로 거른다 — 검색은 식구 묶음 · 손님 · 가족 글에 걸린다", () => {
  const ids = (o: Parameters<typeof selectFamilies>[2]) => selectFamilies(F, NOTES, o).map((f) => f.id);
  assert.deepEqual(ids({ big: "m01" }), ["f01", "f02"]);
  assert.deepEqual(ids({ axis: "빛" }), ["f01"]);
  assert.deepEqual(ids({ q: "단풍" }), ["f02"], "식구 묶음 이름");
  assert.deepEqual(ids({ q: "시간대의 빛" }), ["f01"], "가족 글");
  assert.deepEqual(ids({ q: "가을 햇살" }), ["f01", "f02"], "손님으로 걸친 가족도 나온다");
  assert.deepEqual(ids({}), ["f01", "f02", "f03"]);
});

test("큰 무드마다 가족 · 묶음 · 검색어 수를 센다", () => {
  assert.deepEqual(moodTally(DATA), [
    { id: "m01", families: 2, groups: 4, terms: 8 },
    { id: "m02", families: 1, groups: 1, terms: 2 },
  ]);
});

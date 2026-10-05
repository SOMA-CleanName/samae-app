import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeAdditions, selectAdditions, type Addition } from "./mood-additions";

const E: Addition[] = [
  { label: "힙한", axes: ["스타일"], kind: "신조어", sources: ["shortlisted", "generated"], usage: "스트리트 느낌" },
  { label: "필름 감성", axes: ["스타일", "색감"], kind: "구절", sources: ["generated"], usage: "입자감" },
];

test("사진 태그 중 새 어휘에 없는 것만 더하고, 같은 표현이면 합친다", () => {
  const tags = new Map([["힙한", 12], ["조용한", 30], ["  감성  사진 ", 3]]);
  const rows = mergeAdditions(E, tags, new Set(["조용한"]));
  assert.deepEqual(rows.map((r) => r.label), ["힙한", "감성 사진", "필름 감성"], "사진 수 많은 순");
  assert.deepEqual(rows[0].sources, ["shortlisted", "generated", "photo-tags"]);
  assert.equal(rows[0].photos, 12);
  assert.equal(rows[2].photos, 0);
  assert.deepEqual(E[0].sources, ["shortlisted", "generated"], "원본은 건드리지 않는다");
});

test("출처 · 축 · 검색으로 거른다", () => {
  const rows = mergeAdditions(E, new Map(), new Set());
  assert.deepEqual(selectAdditions(rows, { q: "", source: "shortlisted", axis: "" }).map((r) => r.label), ["힙한"]);
  assert.deepEqual(selectAdditions(rows, { q: "", source: "", axis: "색감" }).map((r) => r.label), ["필름 감성"]);
  assert.deepEqual(selectAdditions(rows, { q: "입자", source: "", axis: "" }).map((r) => r.label), ["필름 감성"]);
});

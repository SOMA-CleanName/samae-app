import { test } from "node:test";
import assert from "node:assert/strict";
import { planAutoAppend, planAutoSync, type ExistingLink } from "./spot-photo-sync";

const auto = (photoId: string, excluded = false): ExistingLink => ({ photoId, source: "auto", excluded });
const manual = (photoId: string): ExistingLink => ({ photoId, source: "manual", excluded: false });

test("처음 계산이면 매칭 순서대로 자동 연결을 만든다", () => {
  const plan = planAutoSync([], ["a", "b", "c"]);
  assert.deepEqual(plan.upsert, [
    { photoId: "a", sort: 0, excluded: false },
    { photoId: "b", sort: 1, excluded: false },
    { photoId: "c", sort: 2, excluded: false },
  ]);
  assert.deepEqual(plan.remove, []);
});

test("매칭에서 빠진 자동 연결은 지운다", () => {
  const plan = planAutoSync([auto("a"), auto("b")], ["a"]);
  assert.deepEqual(plan.remove, ["b"]);
  assert.deepEqual(plan.upsert, [{ photoId: "a", sort: 0, excluded: false }]);
});

test("운영자가 뺀 사진은 다시 걸려도 되살리지 않는다", () => {
  const plan = planAutoSync([auto("a", true)], ["a", "b"]);
  assert.deepEqual(plan.upsert, [
    { photoId: "a", sort: 0, excluded: true },
    { photoId: "b", sort: 1, excluded: false },
  ]);
});

test("운영자가 뺀 사진은 매칭에서 빠져도 지우지 않는다 — 다시 걸렸을 때 뺀 표시가 남아 있어야 한다", () => {
  const plan = planAutoSync([auto("a", true)], []);
  assert.deepEqual(plan.remove, []);
});

test("운영자가 넣은 사진은 건드리지 않는다 — 매칭에 걸려도, 빠져도", () => {
  const plan = planAutoSync([manual("m1"), manual("m2")], ["m1", "x"]);
  assert.deepEqual(plan.upsert, [{ photoId: "x", sort: 1, excluded: false }]);
  assert.deepEqual(plan.remove, []);
});

test("신규만 볼 때는 새 사진을 기존 것 뒤에 더하기만 한다", () => {
  const plan = planAutoAppend([auto("a"), manual("m")], ["n1", "n2"], 10);
  assert.deepEqual(plan.upsert, [
    { photoId: "n1", sort: 10, excluded: false },
    { photoId: "n2", sort: 11, excluded: false },
  ]);
  assert.deepEqual(plan.remove, []);
});

test("신규만 볼 때는 이미 연결된 사진을 건드리지 않는다 — 뺀 것도, 직접 넣은 것도", () => {
  const plan = planAutoAppend([auto("x", true), manual("m")], ["x", "m", "n"], 5);
  assert.deepEqual(plan.upsert, [{ photoId: "n", sort: 5, excluded: false }]);
  assert.deepEqual(plan.remove, []);
});

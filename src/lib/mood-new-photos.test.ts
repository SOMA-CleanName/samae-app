import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeVectors, proposedFamilies, latestNewConfirms, newConfirmedByFamily, newPhotoRow, normTag, proposalCut, scoreNewPhoto, type FamilyModel } from "./mood-new-photos.ts";

const encode = (rows: number[][]) => {
  const f = new Float32Array(rows.flat());
  return btoa(String.fromCharCode(...new Uint8Array(f.buffer)));
};

const model: FamilyModel = {
  made_at: "", prompts_hash: "h", z_cut: 1, z_floor: 1, tag_bonus: 1.5,
  families: ["f01", "f02", "f05"],
  words: { f01: ["꽃", "벚꽃"], f02: ["카페"], f05: ["흑백"] },
  dim: 2,
  vectors: encode([[1, 0], [0, 1], [0.6, 0.8]]),
  stats: { f01: [0, 0.1], f02: [0, 0.1], f05: [0, 0.1] },
  measured: { f05: "모노톤" },
  tone_stats: { f05: [-10, 2] },
};

test("가족 벡터를 풀고 · 허브 보정 · 고정 통계로 z 를 낸다", () => {
  const vectors = decodeVectors(model);
  assert.equal(vectors.length, 3);
  assert.ok(Math.abs(vectors[2][1] - 0.8) < 1e-6);
  const got = scoreNewPhoto(model, vectors, { embedding: [2, 0], tone: null, tags: [] });
  // 코사인 1 · 0 · 0.6 → 평균 0.533 을 빼면 0.467 · −0.533 · 0.067 → /0.1
  assert.deepEqual(got.map(([k]) => k), ["f01"], "기준(1.0) 넘는 것만");
  assert.equal(got[0][1], 4.67);
});

test("작가 태그가 가족 말과 같으면 가산 · 측정 가족은 tone 으로 잰 z 와 큰 쪽", () => {
  const vectors = decodeVectors(model);
  const got = scoreNewPhoto(model, vectors, { embedding: [0, 1], tone: Array.from({ length: 22 }, (_, i) => (i === 20 ? 2 : 0)), tags: ["#카페 "] });
  const z = Object.fromEntries(got.map(([k, s, t]) => [k, [s, t]]));
  // 코사인 0 · 1 · 0.8 → 평균 0.6 을 빼면 −0.6 · 0.4 · 0.2 → /0.1
  assert.deepEqual(z.f02, [5.5, true], "4 + 카페 태그 1.5");
  assert.deepEqual(z.f05, [4, false], "SigLIP 2 보다 채도로 잰 (−2 − −10)/2 = 4 가 크다");
});

test("normTag 는 python norm 과 같다", () => {
  assert.equal(normTag("Ｖｉｎｔａｇｅ 감성!"), "vintage감성");
});

test("태그 줄 — 큰 무드는 기본 기준으로, 태그가 없으면 가까운 가족 셋", () => {
  const bigOf = new Map([["f01", "m01"], ["f02", "m01"]]);
  assert.deepEqual(newPhotoRow([["f01", 2, false], ["f02", 1.5, false]], bigOf, 1), { families: [["f01", 2, false], ["f02", 1.5, false]], moods: [["m01", 2]] });
  assert.deepEqual(newPhotoRow([], bigOf, 1, [["f02", 0.4], ["f01", 0.1]]).near, [["f02", 0.4], ["f01", 0.1]]);
});

test("신규 확정 — 마지막 줄이 이기고 null 은 취소, 확정 뒤 뺀 태그는 빠진다", () => {
  const confirms = latestNewConfirms([
    { photo: "a", families: ["f01", "f02"], at: "1" },
    { photo: "b", families: ["f01"], at: "1" },
    { photo: "b", families: null, at: "2" },
  ]);
  assert.deepEqual([...confirms.keys()], ["a"]);
  assert.deepEqual([...newConfirmedByFamily(confirms, new Set(["a|family|f02"]))], [["f01", ["a"]]]);
});

test("제안 기준 — 가족 기준과 가장 낮게 확정한 구간 중 높은 쪽", () => {
  assert.equal(proposalCut(1, [3, 2.5, 2]), 2);
  assert.equal(proposalCut(2.2, [3, 1]), 2.2);
  assert.equal(proposalCut(1, undefined), 1);
});

test("제안 — 기준 이상 · 문장 고칠 가족 제외, 뺀 것은 표시", () => {
  const row = { families: [["f01", 3, false], ["f02", 1.2, true], ["f03", 2.5, false]] as [string, number, boolean][], moods: [] };
  const got = proposedFamilies("p", row, (k) => (k === "f02" ? 1.5 : 1), (k) => k === "f03", new Set(["p|family|f01"]));
  assert.deepEqual(got, [{ key: "f01", z: 3, byTag: false, dropped: true }]);
});

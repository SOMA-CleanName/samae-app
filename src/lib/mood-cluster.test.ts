import assert from "node:assert/strict";
import { test } from "node:test";
import { clusterFrom, counts, effective, latestReviews, selectCases, type ClusterCase, type ClusterReview } from "./mood-cluster";

const G = (head: string, label: string, terms: string[]) =>
  ({ head, label, axes: ["빛"], usage: "", terms: terms.map((term) => ({ term, gloss: "" })) });

const CASES: ClusterCase[] = [
  { id: "r001", kind: "root", reason: "뿌리 감박",
    groups: [G("깜박이다", "깜박이는", ["깜박이는", "명멸"]), G("껌벅하다", "껌벅이는", ["껌벅이는"]), G("깜작", "깜작", ["깜작"])] },
  { id: "s001", kind: "similar", reason: "서로 고름 · 유사도 0.96",
    groups: [G("주황", "주황", ["주황"]), G("주황색", "주황색", ["주황색"])] },
];
const at = "2026-09-21T00:00:00Z";

test("고른 묶음이 둘 이상이어야 무리다 — 대표는 없다", () => {
  assert.deepEqual(clusterFrom(CASES[0].groups, ["깜박이다", "껌벅하다"]), { members: ["깜박이다", "껌벅하다"] });
  assert.equal(clusterFrom(CASES[0].groups, ["깜박이다"]), null, "하나로는 무리가 안 된다");
});

test("후보에 없는 묶음은 버린다 — 폼 값은 믿지 않는다", () => {
  assert.equal(clusterFrom(CASES[0].groups, ["깜박이다", "번개"]), null);
});

test("같은 후보를 여러 번 정하면 마지막 것만 산다", () => {
  const reviews: ClusterReview[] = [{ id: "r001", verdict: "group", at }, { id: "r001", verdict: "keep", at }];
  assert.equal(latestReviews(reviews).get("r001")?.verdict, "keep");
});

test("사람이 볼 것 = 에이전트가 애매하다고 넘긴 것 중 아직 안 정한 것", () => {
  const cases: ClusterCase[] = [
    { ...CASES[0], id: "a", ai: { verdict: "unsure", why: "" } },
    { ...CASES[1], id: "b", ai: { verdict: "group", members: ["주황", "주황색"], why: "" } },
    { ...CASES[1], id: "c", ai: { verdict: "keep", why: "" } },
    { ...CASES[1], id: "d", ai: { verdict: "unsure", why: "" } },
  ];
  const reviews = latestReviews([{ id: "d", verdict: "keep", at }]);
  assert.deepEqual(selectCases(cases, reviews, "unsure", "").map((c) => c.id), ["a"]);
  assert.deepEqual(selectCases(cases, reviews, "ai-group", "").map((c) => c.id), ["b"]);
  assert.deepEqual(selectCases(cases, reviews, "mine", "").map((c) => c.id), ["d"]);
  assert.deepEqual(counts(cases, reviews), { unsure: 1, "ai-group": 1, "ai-keep": 1, mine: 1, all: 4 });
});

test("정해진 상태는 사람 판정이 이기고, 없으면 에이전트 판정 — 애매함은 미정", () => {
  const c: ClusterCase = { ...CASES[1], ai: { verdict: "group", members: ["주황", "주황색"], why: "" } };
  assert.equal(effective(c).by, "ai");
  assert.equal(effective(c, { id: c.id, verdict: "keep", at }).verdict, "keep");
  assert.equal(effective({ ...c, ai: { verdict: "unsure", why: "" } }).verdict, undefined);
});

test("검색과 후보 갈래로 거른다", () => {
  const none = new Map();
  assert.deepEqual(selectCases(CASES, none, "all", "similar").map((c) => c.id), ["s001"]);
  assert.deepEqual(selectCases(CASES, none, "all", "", "명멸").map((c) => c.id), ["r001"]);
});

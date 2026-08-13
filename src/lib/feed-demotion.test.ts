import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeDemotedSimilar,
  mapSimilarityRows,
  nextFeedPhase,
  composeDetailRecommendations,
  promotionStage,
  rebalancePortraitShare,
  uniqueWithinCycle,
  type DemotionCandidate,
} from "./feed-demotion.ts";

const normal: DemotionCandidate[] = Array.from({ length: 8 }, (_, index) => ({
  id: `n${index}`,
  naturalRank: index,
  demoted: false,
}));

const demoted: DemotionCandidate[] = [
  { id: "d0", naturalRank: 1, demoted: true },
  { id: "d1", naturalRank: 4, demoted: true },
];

test("one related click keeps demoted similar photos after normal similar photos", () => {
  const result = mergeDemotedSimilar(normal, demoted, 1);
  assert.deepEqual(result.map((item) => item.id), [...normal.map((item) => item.id), "d0", "d1"]);
});

test("two consistent clicks promote demoted candidates into the lower quarter", () => {
  assert.equal(promotionStage(2, 0.2), 2);
  const ids = mergeDemotedSimilar(normal, demoted, 2).map((item) => item.id);
  assert.ok(ids.indexOf("d0") >= Math.floor(normal.length * 0.75));
  assert.ok(ids.indexOf("d0") < normal.length);
});

test("three consistent clicks promote demoted candidates around the midpoint", () => {
  assert.equal(promotionStage(3, 0.25), 3);
  const ids = mergeDemotedSimilar(normal, demoted, 3).map((item) => item.id);
  assert.ok(ids.indexOf("d0") >= 4 && ids.indexOf("d0") <= 6);
});

test("four consistent clicks restore candidates near natural similarity rank", () => {
  assert.equal(promotionStage(4, 0.3), 4);
  const ids = mergeDemotedSimilar(normal, demoted, 4).map((item) => item.id);
  assert.ok(ids.indexOf("d0") <= 2);
  assert.ok(ids.indexOf("d1") <= 6);
});

test("inconsistent repeated clicks do not remove the base demotion", () => {
  assert.equal(promotionStage(4, 0.05), 1);
});

test("cycle filtering removes clicked, seen, and duplicate ids only from the supplied cycle", () => {
  const result = uniqueWithinCycle(
    [normal[0], normal[1], normal[0], demoted[0]],
    new Set([normal[1].id]),
    10
  );
  assert.deepEqual(result.map((item) => item.id), [normal[0].id, demoted[0].id]);
  assert.deepEqual(uniqueWithinCycle([normal[1]], new Set(), 10).map((item) => item.id), [normal[1].id]);
});

test("similarity RPC feed_hidden state maps to application demoted state", () => {
  const rows = mapSimilarityRows([
    { id: "a", feed_hidden: true, distance: 0.1 },
    { id: "b", feed_hidden: false, distance: 0.2 },
  ]);
  assert.deepEqual(rows, [
    { id: "a", demoted: true, naturalRank: 0, distance: 0.1 },
    { id: "b", demoted: false, naturalRank: 1, distance: 0.2 },
  ]);
});

test("home feed phase advances normal to demoted to the next normal cycle", () => {
  assert.deepEqual(nextFeedPhase("normal", 2), { phase: "demoted", cycle: 2 });
  assert.deepEqual(nextFeedPhase("demoted", 2), { phase: "normal", cycle: 3 });
});

test("detail recommendation keeps demoted similar before unrelated photos for one anchor", () => {
  const unrelated = [{ id: "u0", naturalRank: 99, demoted: false }];
  assert.deepEqual(
    composeDetailRecommendations(normal.slice(0, 3), demoted.slice(0, 1), unrelated, 1)
      .map((item) => item.id),
    ["n0", "n1", "n2", "d0", "u0"]
  );
});

test("portrait rebalancing keeps extremely similar candidates near the top while dispersing orientation", () => {
  const candidates = [
    { id: "l0", width: 1600, height: 900, distance: 0.1 },
    { id: "l1", width: 1600, height: 900, distance: 0.114 },
    { id: "l2", width: 1600, height: 900, distance: 0.13 },
    { id: "p0", width: 900, height: 1600, distance: 0.14 },
    { id: "p1", width: 900, height: 1600, distance: 0.15 },
    { id: "p2", width: 900, height: 1600, distance: 0.16 },
    { id: "p3", width: 900, height: 1600, distance: 0.17 },
    { id: "p4", width: 900, height: 1600, distance: 0.18 },
  ];

  assert.deepEqual(
    rebalancePortraitShare(candidates).map((candidate) => candidate.id),
    ["l0", "p0", "p1", "p2", "l1", "p3", "p4", "l2"]
  );
});

test("portrait rebalancing disperses a protected landscape cluster across the first viewport", () => {
  const protectedLandscapes = Array.from({ length: 6 }, (_, index) => ({
    id: `l${index}`,
    width: 1600,
    height: 1067,
    distance: 0.1 + index * 0.002,
  }));
  const portraits = Array.from({ length: 18 }, (_, index) => ({
    id: `p${index}`,
    width: 1600,
    height: 2400,
    distance: 0.14 + index * 0.002,
  }));

  const result = rebalancePortraitShare([...protectedLandscapes, ...portraits]);

  assert.deepEqual(
    result.slice(0, 8).map((candidate) => candidate.id[0]),
    ["l", "p", "p", "p", "l", "p", "p", "p"]
  );
  assert.deepEqual(
    protectedLandscapes.map((candidate) => result.findIndex((item) => item.id === candidate.id)),
    [0, 4, 8, 12, 16, 20]
  );
});

test("portrait rebalancing keeps stable order within portrait and other candidates", () => {
  const candidates = [
    { id: "l0", width: 1600, height: 900 },
    { id: "p0", width: 900, height: 1600 },
    { id: "l1", width: 1600, height: 900 },
    { id: "p1", width: 900, height: 1600 },
    { id: "p2", width: 900, height: 1600 },
    { id: "p3", width: 900, height: 1600 },
  ];

  assert.deepEqual(
    rebalancePortraitShare(candidates).map((candidate) => candidate.id),
    ["p0", "p1", "p2", "l0", "p3", "l1"]
  );
});

test("portrait rebalancing returns every candidate when portrait supply is short", () => {
  const candidates = [
    { id: "l0", width: 1600, height: 900 },
    { id: "p0", width: 900, height: 1600 },
    { id: "l1", width: 1600, height: 900 },
  ];

  assert.deepEqual(
    rebalancePortraitShare(candidates).map((candidate) => candidate.id),
    ["p0", "l0", "l1"]
  );
});

test("portrait rebalancing uses the shared best distance instead of protecting a weak subgroup", () => {
  const candidates = [
    { id: "l0", width: 1600, height: 900, distance: 0.2 },
    { id: "p0", width: 900, height: 1600, distance: 0.21 },
    { id: "p1", width: 900, height: 1600, distance: 0.22 },
    { id: "p2", width: 900, height: 1600, distance: 0.23 },
  ];

  assert.deepEqual(
    rebalancePortraitShare(candidates, 0.75, 0.015, 0.1).map((candidate) => candidate.id),
    ["p0", "p1", "p2", "l0"]
  );
});

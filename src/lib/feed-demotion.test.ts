import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeDemotedSimilar,
  mapSimilarityRows,
  nextFeedPhase,
  promotionStage,
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

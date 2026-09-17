import assert from "node:assert/strict";
import { test } from "node:test";
import {
  components, edgeKey, expand, resolveNeighbors, shakyEdges, searchHeads,
  type Edit, type NeighborBundle,
} from "./mood-neighbors";

const BUNDLE: NeighborBundle = {
  heads: ["황혼", "저녁노을", "세기말", "깜박이다", "반짝이다", "외톨이"],
  nodes: {
    "황혼": { senses: ["해가 지고 조금씩 어두워지는 때"], axes: ["시간대", "빛"], usage: "" },
    "저녁노을": { senses: ["저녁에 해가 질 때 물드는 노을"], axes: ["시간대"], usage: "" },
    "세기말": { senses: ["도덕이나 질서가 어지럽고 퇴폐적인 분위기"], axes: ["스타일"], usage: "" },
    "깜박이다": { senses: ["불빛이 밝았다 어두워졌다 하다"], axes: ["빛"], usage: "" },
    "반짝이다": { senses: ["작은 빛이 잠깐 나타났다 사라지다"], axes: ["빛"], usage: "" },
    "외톨이": { senses: ["혼자인 사람"], axes: ["감정"], usage: "" },
  },
  edges: [
    { a: "황혼", b: "저녁노을", state: "mutual", score: 0.51, photos: 12, sameFirst: false },
    { a: "황혼", b: "세기말", state: "disagreed", score: 0.48, photos: 0, sameFirst: false },
    { a: "깜박이다", b: "반짝이다", state: "unasked", score: 0.62, photos: 3, sameFirst: false },
  ],
  judged: 6,
};
const stamp = "2026-09-16T00:00:00Z";

test("간선은 무향이라 어느 쪽에서 불러도 같은 키가 나온다", () => {
  assert.equal(edgeKey("황혼", "저녁노을"), edgeKey("저녁노을", "황혼"));
});

test("한쪽이라도 이었으면 양쪽에 이웃으로 선다", () => {
  const byHead = resolveNeighbors(BUNDLE, []);
  assert.deepEqual(byHead.get("세기말")?.map((n) => n.head), ["황혼"], "엇갈린 간선도 양쪽에 선다");
  assert.deepEqual(byHead.get("반짝이다")?.map((n) => n.head), ["깜박이다"], "물어보지 않은 간선도 마찬가지");
});

test("사람이 끊으면 양쪽에서 사라지고, 이으면 양쪽에 생긴다", () => {
  const cut: Edit[] = [{ a: "황혼", b: "세기말", action: "remove", at: stamp }];
  const afterCut = resolveNeighbors(BUNDLE, cut);
  assert.equal(afterCut.get("세기말"), undefined);
  assert.deepEqual(afterCut.get("황혼")?.map((n) => n.head), ["저녁노을"]);

  const join: Edit[] = [{ a: "외톨이", b: "황혼", action: "add", note: "직접 이음", at: stamp }];
  const afterJoin = resolveNeighbors(BUNDLE, join);
  assert.deepEqual(afterJoin.get("외톨이")?.map((n) => n.head), ["황혼"]);
  assert.equal(afterJoin.get("황혼")?.find((n) => n.head === "외톨이")?.edited, "add");
});

test("같은 간선을 여러 번 고치면 마지막 것만 산다", () => {
  const edits: Edit[] = [
    { a: "황혼", b: "저녁노을", action: "remove", at: stamp },
    { a: "저녁노을", b: "황혼", action: "add", at: stamp },   // 순서가 뒤바뀌어도 같은 간선
  ];
  const byHead = resolveNeighbors(BUNDLE, edits);
  assert.ok(byHead.get("황혼")?.some((n) => n.head === "저녁노을"), "되살아나야 한다");
});

test("엇갈린 간선 목록에는 판단이 갈린 것만 — 물어보지 않은 것은 엇갈린 게 아니다", () => {
  const shaky = shakyEdges(BUNDLE, []);
  assert.deepEqual(shaky.map((e) => `${e.a}~${e.b}`), ["황혼~세기말"], "엇갈린 간선도 이어져 있되 표시는 된다");
  const settled: Edit[] = [{ a: "황혼", b: "세기말", action: "remove", at: stamp }];
  assert.deepEqual(shakyEdges(BUNDLE, settled), [], "사람이 손대면 목록에서 빠진다");
});

test("연결 요소로 그래프가 몇 덩어리인지 본다 — 섬 안에서는 추천이 못 돈다", () => {
  const byHead = resolveNeighbors(BUNDLE, []);
  assert.deepEqual(components(BUNDLE.heads, byHead), [3, 2, 1], "황혼 무리 · 깜박임 무리 · 외톨이");
});

test("여러 홉을 걸어 넓힌다", () => {
  const byHead = resolveNeighbors(BUNDLE, []);
  assert.deepEqual(expand(byHead, "세기말", 2), [["황혼"], ["저녁노을"]]);
  assert.deepEqual(expand(byHead, "외톨이", 2), [], "이웃이 없으면 뻗어나갈 데가 없다");
});

test("검색은 시작하는 것을 앞에 두고 뜻풀이에도 걸린다", () => {
  assert.deepEqual(searchHeads(BUNDLE.heads, BUNDLE.nodes, "황혼"), ["황혼"]);
  assert.deepEqual(searchHeads(BUNDLE.heads, BUNDLE.nodes, "노을"), ["저녁노을"],
    "황혼은 제 뜻풀이에 '노을' 이 없으므로 안 걸린다 — 남의 뜻풀이로는 찾지 않는다");
  assert.deepEqual(searchHeads(BUNDLE.heads, BUNDLE.nodes, "퇴폐"), ["세기말"], "뜻풀이로 찾는다");
  assert.deepEqual(searchHeads(BUNDLE.heads, BUNDLE.nodes, "  "), []);
});

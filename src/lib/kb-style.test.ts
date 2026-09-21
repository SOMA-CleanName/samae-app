// 다듬기가 사실을 흘리지 않는지.
//   npx tsx --test src/lib/kb-style.test.ts
//
// 문장을 줄이는 일은 늘 사실을 같이 지우려 든다. 금액·기한·조건이 빠지면 깔끔해진 게
// 아니라 틀린 것이고, 그 문장이 안내 이미지와 챗봇 근거로 동시에 나간다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFactsKept, mergePolished, KB_WRITING_RULES } from "./kb-style.ts";
import type { KbCard } from "./bot-kb.ts";

const card = (id: string, body: string): KbCard => ({ id, topic: "가격", body, source: "작가 답변" });

test("말투만 바뀌면 통과한다", () => {
  const before = "퍼스널 스냅은 180,000원입니다. 최종 보정본 15장을 드립니다.";
  const after = "퍼스널 스냅 180,000원이에요. 보정본은 15장 드려요.";
  assert.deepEqual(checkFactsKept(before, after), []);
});

test("숫자가 빠지면 잡는다 — 장수가 사라지는 게 가장 흔하다", () => {
  const p = checkFactsKept(
    "퍼스널 스냅은 180,000원입니다. 최종 보정본 15장을 드립니다.",
    "퍼스널 스냅 180,000원이에요."
  );
  assert.ok(p.some((x) => x.includes("15")), p.join(" / "));
});

test("없던 숫자를 만들면 잡는다", () => {
  const p = checkFactsKept("보정본 15장을 드립니다.", "보정본 20장을 드려요.");
  assert.ok(p.length > 0);
});

test("기한 단위가 바뀌면 잡는다 — 7일과 7주는 숫자만 보면 같다", () => {
  const p = checkFactsKept("셀렉 후 7일 이내에 드립니다.", "셀렉 후 7주 이내에 드려요.");
  assert.ok(p.some((x) => x.includes("기한")), p.join(" / "));
});

test("조건을 떼면 잡는다 — 문장은 깔끔해지지만 안내가 틀려진다", () => {
  const p = checkFactsKept(
    "얼굴형 보정을 원하시면 사전에 말씀해주셔야 합니다.",
    "얼굴형 보정도 해드려요."
  );
  assert.ok(p.some((x) => x.includes("조건")), p.join(" / "));
});

test("'별도'가 사라지면 잡는다 — 포함으로 읽히면 금액 분쟁이 된다", () => {
  const p = checkFactsKept("원본 전체 파일은 50,000원에 별도 제공합니다.", "원본 전체 파일도 드려요.");
  assert.ok(p.length > 0);
});

test("모델이 안 돌려준 카드는 원문 그대로 남는다 — 빈 문장으로 덮으면 안내가 사라진다", () => {
  const cards = [card("a", "가격은 180,000원입니다."), card("b", "보정본 15장을 드립니다.")];
  const merged = mergePolished(cards, [{ id: "a", body: "가격은 180,000원이에요." }]);
  assert.equal(merged[1].after, "보정본 15장을 드립니다.");
  assert.deepEqual(merged[1].problems, []); // 안 바뀐 카드를 문제로 올리지 않는다
});

test("바뀐 카드만 사실 검사를 받는다", () => {
  const cards = [card("a", "보정본 15장을 드립니다.")];
  const merged = mergePolished(cards, [{ id: "a", body: "보정본을 드려요." }]);
  assert.ok(merged[0].problems.length > 0);
});

test("규칙에 '드립니다' 남발 금지가 들어 있다 — 추출·다듬기가 같은 규칙을 본다", () => {
  assert.match(KB_WRITING_RULES, /해드립니다/);
  assert.match(KB_WRITING_RULES, /안내 이미지/);
});

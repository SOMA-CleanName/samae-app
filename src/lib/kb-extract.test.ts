// kb-extract 의 순수 로직 — LLM 없이 도는 부분만.
//   npx tsx --test src/lib/kb-extract.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeExtractedCards, missingCoreTopicsOf } from "./kb-extract.ts";
import { MAX_CARD_BODY, MAX_CARDS } from "./bot-kb.ts";

test("중복 id 는 첫 장만 남는다 — 어드민이 거부하는 조건", () => {
  const cards = normalizeExtractedCards([
    { id: "a", topic: "가격", body: "첫 번째" },
    { id: "a", topic: "보정", body: "두 번째" },
  ]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].body, "첫 번째");
});

test("빈 id·빈 body 는 버린다", () => {
  const cards = normalizeExtractedCards([
    { id: "", topic: "가격", body: "본문" },
    { id: "b", topic: "가격", body: "   " },
    { id: "c", topic: "가격", body: "살아남는다" },
  ]);
  assert.deepEqual(
    cards.map((c) => c.id),
    ["c"]
  );
});

test("본문·장수 상한을 넘기지 않는다", () => {
  const long = normalizeExtractedCards([{ id: "x", topic: "가격", body: "가".repeat(999) }]);
  assert.equal(long[0].body.length, MAX_CARD_BODY);

  const many = normalizeExtractedCards(
    Array.from({ length: MAX_CARDS + 10 }, (_, i) => ({ id: `c${i}`, topic: "가격", body: "본문" }))
  );
  assert.equal(many.length, MAX_CARDS);
});

test("환불은 누락으로 세지 않는다 — 플랫폼 공통 정책이 답한다", () => {
  const missing = missingCoreTopicsOf([]);
  assert.ok(!missing.includes("환불"), `환불이 누락에 잡혔다: ${missing.join(", ")}`);
  assert.ok(missing.includes("가격"));
});

test("카드가 있는 주제는 누락에서 빠진다", () => {
  const missing = missingCoreTopicsOf([
    { topic: "가격" },
    { topic: "보정" },
    { topic: "원본" },
    { topic: "일정변경" },
    { topic: "준비물" },
  ]);
  assert.deepEqual(missing, []);
});

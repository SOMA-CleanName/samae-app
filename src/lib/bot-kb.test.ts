import { test } from "node:test";
import assert from "node:assert/strict";
import { validateGrounding, type KbCard } from "./bot-kb.ts";

// 스파이크(scratchpad/kb-spike)에서 실제로 관측된 실패를 회귀로 고정한다.
// LLM 없이 순수 문자열 비교라 CI 에서 항상 돌아간다.

const CARDS: KbCard[] = [
  {
    id: "deposit",
    topic: "예약금",
    body: "예약금은 3만원입니다. 촬영 7일 전까지 취소하시면 전액 환불되고, 그 이후 취소는 환불되지 않습니다.",
  },
  {
    id: "retouch-extra",
    topic: "보정",
    body: "추가 보정은 장당 1만원입니다. 10장 이상 한 번에 요청하시면 장당 8천원으로 계산합니다.",
  },
];

const turn = (reply: string, citedCardIds: string[]) => ({
  reply,
  citedCardIds,
  needsHuman: false,
});

test("정상 답변 — 카드 그대로 인용하면 통과", () => {
  const problems = validateGrounding(
    turn("예약금은 3만원이고, 촬영 7일 전까지 취소하시면 전액 환불돼요.", ["deposit"]),
    CARDS,
    "예약금 있나요?"
  );
  assert.deepEqual(problems, []);
});

test("질문에 나온 숫자를 되풀이하는 건 통과 (오탐 방지)", () => {
  const problems = validateGrounding(
    turn("15장이시면 10장 이상이라 장당 8천원으로 계산해드려요.", ["retouch-extra"]),
    CARDS,
    "추가 보정 15장 하면 장당 얼마예요?"
  );
  assert.deepEqual(problems, []);
});

test("존재하지 않는 카드를 인용하면 차단", () => {
  const problems = validateGrounding(turn("가능합니다.", ["made-up"]), CARDS, "되나요?");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /존재하지 않는 카드/);
});

test("근거에 없는 금액을 지어내면 차단", () => {
  const problems = validateGrounding(
    turn("추가 보정은 장당 2만원이에요.", ["retouch-extra"]),
    CARDS,
    "추가 보정 얼마예요?"
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /근거에 없는 숫자/);
});

test("손님 숫자로 기준 기한을 바꿔치기하면 차단 (haiku 실제 오답)", () => {
  const problems = validateGrounding(
    turn("촬영 3일 전까지는 예약금 3만원이 전액 환불되고, 그 이후는 환불되지 않아요.", ["deposit"]),
    CARDS,
    "촬영 3일 전에 취소하면 환불되나요?"
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /기준 기한 치환/);
});

test("기준을 그대로 안내하면서 손님 날짜를 언급하는 건 통과", () => {
  const problems = validateGrounding(
    turn("환불 기준은 촬영 7일 전까지예요. 5일 전이시면 작가님이 확정해주실 거예요.", ["deposit"]),
    CARDS,
    "촬영 5일 전에 취소하면 환불되나요?"
  );
  assert.deepEqual(problems, []);
});

test("지어낸 기한도 차단", () => {
  const problems = validateGrounding(
    turn("촬영 14일 전까지 취소하시면 전액 환불돼요.", ["deposit"]),
    CARDS,
    "언제까지 취소하면 되나요?"
  );
  assert.ok(problems.some((p) => /기준 기한 치환/.test(p)));
});

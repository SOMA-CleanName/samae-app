import { test } from "node:test";
import assert from "node:assert/strict";
import { groupKbIntoSections, kbFaqPairs, GUIDE_SHEETS } from "./kb-sections";
import type { KbCard } from "./bot-kb";

const card = (topic: string, body: string, id = topic): KbCard =>
  ({ id, topic, body }) as KbCard;

test("주제를 묶음으로 모은다", () => {
  const s = groupKbIntoSections([
    card("가격", "12만원이에요."),
    card("서비스", "월드인 촬영이에요."),
    card("보정", "3일 걸려요."),
  ]);
  assert.deepEqual(
    s.map((x) => x.label),
    ["가격·구성", "보정·수정"]
  );
  // 같은 묶음의 카드는 순서를 지킨다 (작가가 쓴 순서가 설명 순서다)
  assert.deepEqual(s[0].cards.map((c) => c.body), ["12만원이에요.", "월드인 촬영이에요."]);
});

test("빈 묶음은 내보내지 않는다", () => {
  // 제목만 있고 내용이 없는 칸을 지면에 세우면 "준비 중" 으로 읽힌다
  const s = groupKbIntoSections([card("가격", "12만원이에요.")]);
  assert.equal(s.length, 1);
  assert.equal(s[0].label, "가격·구성");
  assert.deepEqual(groupKbIntoSections([]), []);
  assert.deepEqual(groupKbIntoSections(null), []);
});

test("모르는 주제도 버리지 않는다", () => {
  /*
    작가가 직접 쓴 답이다. 우리가 분류표에 안 넣어 뒀다고 빠지면 그만큼 손해고,
    작가 입장에선 "내가 쓴 게 왜 없지" 가 된다.
  */
  const s = groupKbIntoSections([card("주차", "건물 지하에 있어요."), card("가격", "12만원")]);
  assert.deepEqual(s.map((x) => x.label), ["가격·구성", "그 외 안내"]);
  assert.equal(s[1].cards[0].body, "건물 지하에 있어요.");
});

test("이미지 쪽과 같은 매핑을 쓴다", () => {
  /*
    🔴 같은 작가의 「가격·구성」이 이미지와 글에서 다른 내용을 담으면 어느 쪽이 맞는지
       아무도 답할 수 없다. 매핑은 이 파일 한 곳에만 있어야 한다.
  */
  const topics = GUIDE_SHEETS.flatMap((s) => s.topics);
  assert.equal(new Set(topics).size, topics.length, "한 주제가 두 묶음에 속한다");
  assert.ok(GUIDE_SHEETS.some((s) => s.label === "가격·구성" && s.topics.includes("가격")));
});

test("FAQ 질문을 지어내지 않는다", () => {
  /*
    ⚠️ 카드에는 질문이 없다. "가격은 어떻게 되나요?" 같은 질문을 우리가 만들어 붙이면
       **작가가 답한 적 없는 질문**이 되고, 그게 검색 결과에 작가 이름으로 뜬다.
       topic 이 곧 "무엇에 대한 답인가" 이므로 그걸 그대로 쓴다.
  */
  const s = groupKbIntoSections([card("가격", "12만원이에요."), card("보정", "3일 걸려요.")]);
  const pairs = kbFaqPairs(s, "모글");
  assert.deepEqual(pairs, [
    { question: "모글 — 가격·구성", answer: "12만원이에요." },
    { question: "모글 — 보정·수정", answer: "3일 걸려요." },
  ]);
  assert.equal(pairs.some((p) => /나요\?|인가요/.test(p.question)), false);
});

test("이름이 없으면 이름 없이 — 빈 접두사를 만들지 않는다", () => {
  const s = groupKbIntoSections([card("가격", "12만원")]);
  assert.equal(kbFaqPairs(s, null)[0].question, "가격·구성");
  assert.equal(kbFaqPairs(s, "  ")[0].question, "가격·구성");
});

test("한 묶음의 카드 여러 장은 한 답변으로 이어 붙인다", () => {
  const s = groupKbIntoSections([card("가격", "A", "a"), card("서비스", "B", "b")]);
  assert.equal(kbFaqPairs(s, "x")[0].answer, "A\n\nB");
});

test("내용이 빈 묶음은 FAQ 에 넣지 않는다", () => {
  // 빈 answer 가 들어가면 구조화 데이터가 무효가 된다
  assert.deepEqual(kbFaqPairs([{ label: "가격·구성", en: "Price", cards: [] }], "x"), []);
  assert.deepEqual(
    kbFaqPairs([{ label: "가격", en: "P", cards: [card("가격", "   ")] }], "x"),
    []
  );
});

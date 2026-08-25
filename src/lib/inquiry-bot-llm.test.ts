import assert from "node:assert/strict";
import test from "node:test";
import {
  answersToSlots,
  buildSystemPrompt,
  coreSlotsFilled,
  hasPhotographerIntervened,
  sanitizeBotTurn,
  slotsToAnswers,
  type BotChatMessage,
  type BotTurn,
} from "./inquiry-bot-llm.ts";
import { DEFAULT_SCRIPT, getPhotographerScript, hasCustomScript } from "./photographer-scripts.ts";

// ── 핸드오프 정지 로직 ───────────────────────────────────────────
test("hasPhotographerIntervened — 작가 발화가 있으면 true", () => {
  const messages: BotChatMessage[] = [
    { role: "bot", text: "어떤 촬영을 원하시나요?" },
    { role: "user", text: "커플 스냅이요" },
    { role: "photographer", text: "안녕하세요, 작가입니다. 제가 이어서 안내드릴게요." },
  ];
  assert.equal(hasPhotographerIntervened(messages), true);
});

test("hasPhotographerIntervened — 봇·사용자만 있으면 false", () => {
  const messages: BotChatMessage[] = [
    { role: "bot", text: "안녕하세요" },
    { role: "user", text: "문의드려요" },
  ];
  assert.equal(hasPhotographerIntervened(messages), false);
  assert.equal(hasPhotographerIntervened([]), false);
});

// ── 슬롯 변환 ────────────────────────────────────────────────────
test("slotsToAnswers/answersToSlots — 코어 슬롯 왕복 변환", () => {
  const slots = { purpose: "커플·우정 스냅", region: "서울", custom: { 무드: "필름 감성" } };
  const answers = slotsToAnswers(slots);
  assert.deepEqual(answers, { purpose: "커플·우정 스냅", region: "서울" });
  assert.deepEqual(answersToSlots(answers), { purpose: "커플·우정 스냅", region: "서울" });
});

test("coreSlotsFilled — 4개 전부 있어야 true, 빈 문자열은 미수집", () => {
  assert.equal(coreSlotsFilled({ purpose: "웨딩", preferredDate: "2026-09-01", region: "서울", partySize: "2명" }), true);
  assert.equal(coreSlotsFilled({ purpose: "웨딩", preferredDate: " ", region: "서울", partySize: "2명" }), false);
  assert.equal(coreSlotsFilled({ purpose: "웨딩" }), false);
});

// ── sanitizeBotTurn ──────────────────────────────────────────────
const baseTurn: BotTurn = {
  reply: " 알겠습니다! ",
  slots: {},
  quickReplies: [],
  asking: "none",
  done: false,
};

test("sanitizeBotTurn — 이전 슬롯을 유지하고 새 값을 병합 (후퇴 방지)", () => {
  const prev = { purpose: "웨딩", region: "서울" };
  const out = sanitizeBotTurn({ ...baseTurn, slots: { partySize: "2명" } }, prev);
  assert.deepEqual(out.slots, { purpose: "웨딩", region: "서울", partySize: "2명" });
  assert.equal(out.reply, "알겠습니다!");
});

test("sanitizeBotTurn — 코어 슬롯 미완이면 done=true 를 무시", () => {
  const out = sanitizeBotTurn({ ...baseTurn, done: true, slots: { purpose: "웨딩" } }, {});
  assert.equal(out.done, false);
});

test("sanitizeBotTurn — 코어 4슬롯이 모두 차면 done 허용", () => {
  const out = sanitizeBotTurn(
    { ...baseTurn, done: true, slots: { partySize: "2명" } },
    { purpose: "웨딩", preferredDate: "미정", region: "서울" }
  );
  assert.equal(out.done, true);
});

test("sanitizeBotTurn — custom 답변 병합·quickReplies 정리", () => {
  const out = sanitizeBotTurn(
    {
      ...baseTurn,
      slots: { custom: { 보정: "필름룩" } },
      quickReplies: [" 네 ", "", "아니요"],
    },
    { custom: { 무드: "야경" } }
  );
  assert.deepEqual(out.slots.custom, { 무드: "야경", 보정: "필름룩" });
  assert.deepEqual(out.quickReplies, ["네", "아니요"]);
});

// ── 작가 문의대본 ────────────────────────────────────────────────
test("getPhotographerScript — 미등록 작가는 기본 대본", () => {
  assert.deepEqual(getPhotographerScript("unknown-id"), DEFAULT_SCRIPT);
  assert.equal(hasCustomScript("unknown-id"), false);
});

test("getPhotographerScript — 커스텀 대본 데모 2개 (컨셉·레퍼런스)", () => {
  const concept = getPhotographerScript("7a3adcb6-a03d-4faf-bbd3-5e59c2c3c503");
  assert.equal(concept.id, "concept");
  assert.ok(concept.customQuestions.some((q) => q.includes("배경") || q.includes("분위기")));

  const reference = getPhotographerScript("97d2b1c8-050b-4c80-b444-788b1410a784");
  assert.equal(reference.id, "reference");
  assert.ok(reference.customQuestions.some((q) => q.includes("레퍼런스")));
  assert.ok(reference.customQuestions.length <= 3);
});

// ── 시스템 프롬프트 ──────────────────────────────────────────────
test("buildSystemPrompt — 커스텀 대본 질문·사진 컨텍스트가 프롬프트에 주입된다", () => {
  const prompt = buildSystemPrompt({
    photographerName: "무루필름",
    script: getPhotographerScript("97d2b1c8-050b-4c80-b444-788b1410a784"),
    photo: { moodTags: ["커플사진", "데이트"], priceKrw: 500000 },
  });
  assert.ok(prompt.includes("무루필름"));
  assert.ok(prompt.includes("레퍼런스 이미지"));
  assert.ok(prompt.includes("커플사진"));
  assert.ok(prompt.includes("500,000원~"));
  // 코어 슬롯 규칙(상태 머신 재사용)이 들어있는지
  assert.ok(prompt.includes("커플·우정 스냅"));
  assert.ok(prompt.includes("preferredDate"));
});

test("buildSystemPrompt — 기본 대본이면 커스텀 질문 블록이 없다", () => {
  const prompt = buildSystemPrompt({ photographerName: "작가", script: DEFAULT_SCRIPT, photo: null });
  assert.ok(!prompt.includes("작가 커스텀 질문"));
  assert.ok(!prompt.includes("참고 가격"));
});

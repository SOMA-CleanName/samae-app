import assert from "node:assert/strict";
import test from "node:test";
import {
  answersToSlots,
  botTurnSchema,
  buildSystemPrompt,
  coreSlotsFilled,
  createUtteranceQueue,
  hasPhotographerIntervened,
  sanitizeBotTurn,
  shouldNotifyStarted,
  slotsToAnswers,
  validateMessageLimits,
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

test("sanitizeBotTurn — 코어 질문이면 정식 선택지 칩을 항상 보장 (LLM 칩이 비거나 부분이어도)", () => {
  // LLM 이 칩을 안 준 턴 — region 정식 옵션 + soft-skip 으로 채워진다
  const empty = sanitizeBotTurn({ ...baseTurn, asking: "region" }, {});
  assert.deepEqual(empty.quickReplies, [
    "서울", "경기·인천", "부산·경남", "대구·경북", "대전·충청", "광주·전라", "제주", "협의 후 결정",
  ]);
  // LLM 이 일부만 준 턴도 정식 선택지로 통일 (버튼 플로우와 동일 UX)
  const partial = sanitizeBotTurn({ ...baseTurn, asking: "partySize", quickReplies: ["2명"] }, {});
  assert.deepEqual(partial.quickReplies, ["1명", "2명", "3~6명", "그 이상", "미정"]);
  // 날짜 질문은 빠른 칩 + soft-skip
  const date = sanitizeBotTurn({ ...baseTurn, asking: "preferredDate" }, {});
  assert.deepEqual(date.quickReplies, ["2주 이내", "한 달 이내", "날짜는 미정이에요"]);
  // 커스텀·서술형 질문은 LLM 제안 칩 유지
  const custom = sanitizeBotTurn({ ...baseTurn, asking: "custom", quickReplies: ["필름 감성"] }, {});
  assert.deepEqual(custom.quickReplies, ["필름 감성"]);
});

// 회귀: haiku 가 미수집 슬롯을 `"region": null` 로 내보내 OUTPUT_PARSING_FAILURE → 502 →
// 버튼 폴백 강등이 발생했던 실사고 케이스. 스키마가 null 을 받고 sanitize 가 정규화해야 한다.
test("botTurnSchema — 미수집 슬롯 null 허용 + sanitize 정규화 (파싱 사고 회귀)", () => {
  const raw = botTurnSchema.parse({
    reply: "좋습니다. 촬영 지역을 선택해주세요.",
    slots: {
      purpose: "커플·우정 스냅",
      preferredDate: "다음주",
      region: null,
      partySize: null,
      custom: {},
    },
    quickReplies: ["서울", "경기·인천"],
    asking: "region",
    done: false,
  });
  const out = sanitizeBotTurn(raw, {});
  assert.deepEqual(out.slots, { purpose: "커플·우정 스냅", preferredDate: "다음주" });
  assert.equal(out.asking, "region");
  assert.equal(out.done, false);
});

test("botTurnSchema — quickReplies/asking/done 생략·null 도 파싱되고 기본값으로 정규화", () => {
  const raw = botTurnSchema.parse({
    reply: "안녕하세요!",
    slots: { custom: { 무드: null } },
    quickReplies: null,
    asking: null,
    done: null,
  });
  const out = sanitizeBotTurn(raw, {});
  assert.deepEqual(out.quickReplies, []);
  assert.equal(out.asking, "none");
  assert.equal(out.done, false);
  assert.equal(out.slots.custom, undefined); // 값이 null 인 custom 항목은 버려진다
});

// ── 요청 상한 (A1) ───────────────────────────────────────────────
test("validateMessageLimits — 턴 수·발화 길이·합계 상한", () => {
  const msg = (text: string): BotChatMessage => ({ role: "user", text });
  assert.deepEqual(validateMessageLimits([msg("안녕하세요")]), { ok: true });
  // 턴 수 초과 (40 초과)
  const many = Array.from({ length: 41 }, () => msg("hi"));
  assert.deepEqual(validateMessageLimits(many), { ok: false, reason: "too_many_turns" });
  // 발화당 2,000자 초과
  assert.deepEqual(validateMessageLimits([msg("a".repeat(2001))]), {
    ok: false,
    reason: "utterance_too_long",
  });
  // 합계 20,000자 초과 (발화당은 통과하는 길이로)
  const bulk = Array.from({ length: 11 }, () => msg("a".repeat(1900)));
  assert.deepEqual(validateMessageLimits(bulk), { ok: false, reason: "conversation_too_long" });
});

// ── started 알림 조건 (A3) ───────────────────────────────────────
test("shouldNotifyStarted — 사용자 첫 실제 발화에서만, dedupe 마크가 있으면 안 보냄", () => {
  const bot = (text: string): BotChatMessage => ({ role: "bot", text });
  const user = (text: string): BotChatMessage => ({ role: "user", text });
  // 빈 messages(크롤러 방문·마운트 턴) — 발화 안 함
  assert.equal(shouldNotifyStarted([], false), false);
  assert.equal(shouldNotifyStarted([bot("인사")], false), false);
  // 사용자 첫 발화 — 발화
  assert.equal(shouldNotifyStarted([bot("인사"), user("커플 스냅이요")], false), true);
  // 두 번째 발화부터는 안 보냄
  assert.equal(shouldNotifyStarted([bot("q1"), user("a1"), bot("q2"), user("a2")], false), false);
  // localStorage dedupe 마크
  assert.equal(shouldNotifyStarted([bot("인사"), user("첫 발화")], true), false);
});

// ── 발화 큐 (B1) ─────────────────────────────────────────────────
test("createUtteranceQueue — 대기 중 발화 적재·drain 후 비워짐", () => {
  const q = createUtteranceQueue();
  assert.equal(q.size(), 0);
  q.enqueue("첫 발화");
  q.enqueue("두 번째 발화");
  assert.equal(q.size(), 2);
  assert.deepEqual(q.drain(), ["첫 발화", "두 번째 발화"]);
  assert.equal(q.size(), 0);
  assert.deepEqual(q.drain(), []); // 재-drain 은 빈 배열
  q.enqueue("다시");
  q.clear();
  assert.equal(q.size(), 0);
});

// ── C1: done 클램프 시 완료 멘트 교체 / C3: 리터럴 \n 정규화 ─────
test("sanitizeBotTurn — 슬롯 미완 done 클램프 + 완료 멘트면 안전 문구로 교체 (인젝션 방어)", () => {
  const out = sanitizeBotTurn(
    {
      ...baseTurn,
      done: true,
      reply: "네! 문의가 완료됐어요. 정리해서 작가님께 전달드릴게요.",
      slots: { purpose: "웨딩" },
    },
    {}
  );
  assert.equal(out.done, false);
  assert.ok(!out.reply.includes("전달드릴게요"));
  assert.ok(out.reply.includes("여쭤볼게요"));
});

test("sanitizeBotTurn — done 클램프여도 정상 질문 reply 는 유지", () => {
  const out = sanitizeBotTurn(
    { ...baseTurn, done: true, reply: "지역은 어디가 좋으세요?", slots: { purpose: "웨딩" } },
    {}
  );
  assert.equal(out.done, false);
  assert.equal(out.reply, "지역은 어디가 좋으세요?");
});

test("sanitizeBotTurn — 리터럴 \\n 을 실제 줄바꿈으로 정규화", () => {
  const out = sanitizeBotTurn({ ...baseTurn, reply: "안녕하세요!\\n어떤 촬영을 원하세요?" }, {});
  assert.equal(out.reply, "안녕하세요!\n어떤 촬영을 원하세요?");
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

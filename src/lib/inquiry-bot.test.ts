import assert from "node:assert/strict";
import test from "node:test";
import {
  CORE_STEPS,
  answerStep,
  answeredCount,
  buildFlow,
  buildSummaryRows,
  displayAnswer,
  formatDateKo,
  formatKakaoInput,
  formatPhoneInput,
  isFlowComplete,
  nextStepIndex,
  toInquiryFields,
  validateContact,
  type BotAnswers,
} from "./inquiry-bot.ts";

// ── 시퀀스 구성 ──────────────────────────────────────────────────

test("기본 플로우는 공통 4문항(목적·희망일·지역·인원)", () => {
  const steps = buildFlow();
  assert.deepEqual(
    steps.map((s) => s.key),
    ["purpose", "preferredDate", "region", "partySize"]
  );
  // 모든 문항에 소프트스킵이 있어야 함
  for (const s of steps) assert.ok(s.skip.length > 0);
});

test("작가 커스텀 질문은 공통 문항 뒤에 최대 3개까지 붙는다", () => {
  const steps = buildFlow([
    { id: "a", question: "원하는 무드가 있나요?", options: ["밝은", "차분한"] },
    { id: "b", question: "레퍼런스 링크가 있나요?" },
    { id: "c", question: "질문 3", options: ["x"] },
    { id: "d", question: "4번째는 잘려야 함" },
  ]);
  assert.equal(steps.length, CORE_STEPS.length + 3);
  assert.equal(steps[4].key, "custom:a");
  assert.equal(steps[4].type, "options"); // 선택지 있으면 options
  assert.equal(steps[5].type, "text"); // 선택지 없으면 자유 입력
  assert.ok(steps.every((s, i) => (i < CORE_STEPS.length ? !s.custom : s.custom)));
});

// ── 진행/누적 ────────────────────────────────────────────────────

test("답변 누적에 따라 다음 스텝이 전진하고 완료가 판정된다", () => {
  const steps = buildFlow();
  let answers: BotAnswers = {};
  assert.equal(nextStepIndex(steps, answers), 0);
  assert.equal(isFlowComplete(steps, answers), false);

  answers = answerStep(answers, "purpose", "웨딩");
  assert.equal(nextStepIndex(steps, answers), 1);
  assert.equal(answeredCount(steps, answers), 1);

  answers = answerStep(answers, "preferredDate", "2026-09-01");
  answers = answerStep(answers, "region", "서울");
  assert.equal(nextStepIndex(steps, answers), 3);

  answers = answerStep(answers, "partySize", "2명");
  assert.equal(nextStepIndex(steps, answers), steps.length);
  assert.equal(isFlowComplete(steps, answers), true);
});

test("answerStep 은 원본을 변경하지 않는 불변 갱신", () => {
  const before: BotAnswers = { purpose: "웨딩" };
  const after = answerStep(before, "region", "서울");
  assert.equal(before.region, undefined);
  assert.equal(after.region, "서울");
});

// ── 표시/요약 ────────────────────────────────────────────────────

test("date 타입의 ISO 값만 한국어 날짜로 표기된다", () => {
  const dateStep = CORE_STEPS.find((s) => s.key === "preferredDate")!;
  assert.equal(displayAnswer(dateStep, "2026-09-01"), formatDateKo("2026-09-01"));
  assert.match(displayAnswer(dateStep, "2026-09-01"), /2026년 9월 1일/);
  assert.equal(displayAnswer(dateStep, "2주 이내"), "2주 이내"); // 빠른 칩은 그대로
  const optStep = CORE_STEPS[0];
  assert.equal(displayAnswer(optStep, "웨딩"), "웨딩");
});

test("요약 카드 행 — 답한 순서 유지·소프트스킵 표시·미답변 제외", () => {
  const steps = buildFlow();
  const answers: BotAnswers = {
    purpose: "웨딩",
    preferredDate: "2026-09-01",
    region: "협의 후 결정", // region 의 소프트스킵
  };
  const rows = buildSummaryRows(steps, answers);
  assert.deepEqual(
    rows.map((r) => r.label),
    ["촬영 종류", "희망일", "지역"] // partySize 미답변 → 제외
  );
  assert.equal(rows[1].value, formatDateKo("2026-09-01"));
  assert.deepEqual(rows.map((r) => r.skipped), [false, false, true]);
});

// ── 제출 변환 (기존 submitInquiry 규칙과 동일해야 함) ────────────

test("toInquiryFields — partySize 스킵은 빈값, 날짜는 표시 문자열, 커스텀 제외", () => {
  const steps = buildFlow([{ id: "a", question: "무드?", options: ["밝은"] }]);
  const answers: BotAnswers = {
    purpose: "그 외 목적", // purpose 스킵은 값 그대로 저장 (위저드와 동일)
    preferredDate: "2026-09-01",
    region: "서울",
    partySize: "미정", // partySize 스킵 → 미입력 처리
    "custom:a": "밝은", // 커스텀 답변은 코어 필드에 섞지 않음
  };
  const fields = toInquiryFields(steps, answers);
  assert.deepEqual(fields, {
    purpose: "그 외 목적",
    preferredDate: formatDateKo("2026-09-01"),
    region: "서울",
    partySize: "",
  });
});

// ── 연락처 (위저드 Q6 규칙) ──────────────────────────────────────

test("전화번호 — 하이픈 자동 삽입·11자리 01x 만 유효", () => {
  assert.equal(formatPhoneInput("01012345678"), "010-1234-5678");
  assert.equal(validateContact("phone", "010-1234-5678").valid, true);
  assert.equal(validateContact("phone", "010-1234").valid, false);
  assert.equal(validateContact("phone", "02-1234-5678").valid, false);
  assert.equal(validateContact("phone", "").error, null); // 빈값은 에러문 없이 무효
});

test("카톡 ID — 소문자화·허용 외 문자 제거·4~20자", () => {
  assert.equal(formatKakaoInput("MyID-99!"), "myid99");
  assert.equal(validateContact("kakao", "abcd").valid, true);
  assert.equal(validateContact("kakao", "abc").valid, false);
});

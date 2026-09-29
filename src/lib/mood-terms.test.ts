import assert from "node:assert/strict";
import { test } from "node:test";
import { ALL_AXES, axisTally, representative, resolveTerms, selectRows, type TermEdit, type TermsBundle } from "./mood-terms";

const BUNDLE: TermsBundle = {
  rows: [
    {
      head: "깜박이다", axes: ["빛"], usage: "불빛이 점멸하는 밤거리",
      terms: ["깜박이는", "명멸"],
      aliases: { "깜박이다": "깜박이는", "깜빡": "깜박이는", "껌벅거리다": "깜박이는" },
      made_up: [], odd: [],
    },
    {
      head: "멍하니", axes: ["감정"], usage: "초점 없이 먼 곳을 보는 얼굴",
      terms: ["멍한", "멀뚱한"],
      aliases: { "멍하니": "멍한", "멀뚱멀뚱": "멀뚱한" },
      made_up: [], odd: [],
    },
    {
      head: "사명감", axes: ["에너지"], usage: "다부진 표정",
      terms: ["사명감"], aliases: {}, made_up: ["전의", "패기"], odd: [],
    },
  ],
  terms: 5, aliases: 5, collisions: {},
};
const stamp = "2026-09-19T00:00:00Z";

test("굳히지 않은 수정이 없으면 번들 그대로 나온다", () => {
  assert.deepEqual(resolveTerms(BUNDLE, []).get("깜박이다"), ["깜박이는", "명멸"]);
});

test("꼴을 고치면 그 자리에서 바뀐다 — 순서가 흐트러지면 눈으로 못 쫓는다", () => {
  const edits: TermEdit[] = [{ head: "멍하니", action: "rename", term: "멍한", to: "멍하니", at: stamp }];
  assert.deepEqual(resolveTerms(BUNDLE, edits).get("멍하니"), ["멍하니", "멀뚱한"]);
});

test("버리면 빠지고, 흡수된 낱말을 되살리면 다시 붙는다", () => {
  const drop: TermEdit[] = [{ head: "깜박이다", action: "drop", term: "명멸", at: stamp }];
  assert.deepEqual(resolveTerms(BUNDLE, drop).get("깜박이다"), ["깜박이는"]);

  const add: TermEdit[] = [{ head: "깜박이다", action: "add", term: "깜빡", at: stamp }];
  assert.deepEqual(resolveTerms(BUNDLE, add).get("깜박이다"), ["깜박이는", "명멸", "깜빡"]);
});

test("같은 낱말을 여러 번 고치면 마지막 것만 산다", () => {
  const edits: TermEdit[] = [
    { head: "깜박이다", action: "drop", term: "명멸", at: stamp },
    { head: "깜박이다", action: "add", term: "명멸", at: stamp },
  ];
  assert.deepEqual(resolveTerms(BUNDLE, edits).get("깜박이다"), ["깜박이는", "명멸"]);
});

test("번들에 없는 묶음의 옛 기록은 무시한다 — 어휘가 바뀌어도 화면이 깨지면 안 된다", () => {
  const stale: TermEdit[] = [{ head: "없는말", action: "drop", term: "무엇", at: stamp }];
  assert.equal(resolveTerms(BUNDLE, stale).size, BUNDLE.rows.length);
});

test("검색은 흡수된 낱말로도 걸린다 — 어느 이름으로 기억하든 찾아야 한다", () => {
  const prompts = new Map([["깜박이다", ["blinking on and off"]]]);
  const find = (q: string, axis = ALL_AXES) => selectRows(BUNDLE.rows, { q, axis, prompts }).map((r) => r.head);
  assert.deepEqual(find("껌벅거리다"), ["깜박이다"]);
  assert.deepEqual(find("밤거리"), ["깜박이다"], "용례로도");
  assert.deepEqual(find("", "감정"), ["멍하니"], "축으로 거르기");
  assert.equal(find("").length, 3, "아무것도 안 넣으면 전체");
  assert.deepEqual(find("Blinking"), ["깜박이다"], "영어 프롬프트로도, 대소문자 없이");
});

test("축 2개 이상만 거르면 한 축짜리는 빠진다", () => {
  const heads = selectRows(BUNDLE.rows, { q: "", axis: ALL_AXES, multi: true }).map((r) => r.head);
  assert.deepEqual(heads, []);
  const two = [{ ...BUNDLE.rows[0], axes: ["빛", "에너지"] }, BUNDLE.rows[1]];
  assert.deepEqual(selectRows(two, { q: "", axis: "에너지", multi: true }).map((r) => r.head), ["깜박이다"]);
});

test("축마다 묶음과 서로 다른 검색어를 센다 — 여러 축에 든 묶음은 축마다 한 번씩", () => {
  const rows = [{ ...BUNDLE.rows[0], axes: ["빛", "감정"] }, BUNDLE.rows[1]];
  const final = new Map([["깜박이다", ["깜박이는", "명멸"]], ["멍하니", ["멍한", "명멸"]]]);
  const tally = axisTally(rows, final);
  assert.deepEqual(tally.get("빛"), { groups: 1, terms: 2 });
  assert.deepEqual(tally.get("감정"), { groups: 2, terms: 3 }, "명멸이 두 묶음에 있어도 하나로");
});

test("묶음 이름은 사전형이 아니라 첫 검색어다 — 대표를 맨 앞에 둔다", () => {
  const row = BUNDLE.rows[0];
  assert.equal(representative(row, ["깜박이는", "명멸"]), "깜박이는");
  assert.equal(representative(row, ["명멸", "깜박이는"]), "명멸", "순서가 곧 대표");
  assert.equal(representative(row, []), "깜박이다", "검색어가 없으면 사전형으로 — 이름 없는 카드는 안 된다");
});

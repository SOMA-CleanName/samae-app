import assert from "node:assert/strict";
import { test } from "node:test";
import {
  counts, resolveTerms, selectRows, touched,
  type TermEdit, type TermsBundle,
} from "./mood-terms";

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
      terms: ["멍하니", "멀뚱한"],
      aliases: { "멀뚱멀뚱": "멀뚱한" },
      made_up: [], odd: ["멍하니"],
    },
    {
      head: "사명감", axes: ["에너지"], usage: "다부진 표정",
      terms: ["사명감"], aliases: {}, made_up: ["전의", "패기"], odd: [],
    },
  ],
  terms: 5, aliases: 4, collisions: {},
};
const stamp = "2026-09-16T00:00:00Z";

test("고친 기록이 없으면 자동 결과가 그대로 나온다", () => {
  const final = resolveTerms(BUNDLE, []);
  assert.deepEqual(final.get("깜박이다"), ["깜박이는", "명멸"]);
});

test("꼴을 고치면 그 자리에서 바뀐다 — 순서가 흐트러지면 눈으로 못 쫓는다", () => {
  const edits: TermEdit[] = [{ head: "멍하니", action: "rename", term: "멍하니", to: "멍한", at: stamp }];
  assert.deepEqual(resolveTerms(BUNDLE, edits).get("멍하니"), ["멍한", "멀뚱한"]);
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

test("거르기는 볼 이유가 있는 것만 남긴다", () => {
  const edits: TermEdit[] = [{ head: "깜박이다", action: "drop", term: "명멸", at: stamp }];
  const pick = (filter: Parameters<typeof selectRows>[1]["filter"]) =>
    selectRows(BUNDLE.rows, { filter, q: "", axis: "", edits }).map((r) => r.head);
  assert.deepEqual(pick("odd"), ["멍하니"]);
  assert.deepEqual(pick("made_up"), ["사명감"]);
  assert.deepEqual(pick("done"), ["깜박이다"], "손댄 것");
  assert.deepEqual(pick("todo"), ["멍하니", "사명감"], "아직 안 본 것");
  assert.equal(counts(BUNDLE.rows, edits).all, 3);
});

test("검색은 흡수된 낱말로도 걸린다 — 어느 이름으로 기억하든 찾아야 한다", () => {
  const find = (q: string) =>
    selectRows(BUNDLE.rows, { filter: "all", q, axis: "", edits: [] }).map((r) => r.head);
  assert.deepEqual(find("껌벅거리다"), ["깜박이다"]);
  assert.deepEqual(find("밤거리"), ["깜박이다"], "용례로도");
  assert.deepEqual(selectRows(BUNDLE.rows, { filter: "all", q: "", axis: "감정", edits: [] })
    .map((r) => r.head), ["멍하니"]);
});

test("손댄 묶음을 센다 — 검수 진행도가 된다", () => {
  assert.equal(touched([
    { head: "깜박이다", action: "drop", term: "명멸", at: stamp },
    { head: "깜박이다", action: "add", term: "명멸", at: stamp },
  ]).size, 1);
});

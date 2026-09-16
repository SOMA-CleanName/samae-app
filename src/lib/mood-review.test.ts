import assert from "node:assert/strict";
import { test } from "node:test";
import { selectGroups, levelLabel, isJudged, type Group, type Verdict } from "./mood-review";

const GROUPS: Group[] = [
  { head: "놀라다", level: 0, members: ["경악", "기겁하다", "질겁", "놀래다", "쇼킹하다"], prompts: ["startled and shocked"] },
  { head: "흠칫", level: 2, members: ["흠칫하다"], prompts: ["startled shiver"] },
  { head: "자혜롭다", level: 2, members: [], prompts: ["kind and benevolent"] },
];
const VERDICTS: Record<string, Verdict> = {
  흠칫: { status: "ok", at: "2026-09-16T00:00:00Z" },
  자혜롭다: { note: "뜻풀이가 한 갈래뿐이라 다시 볼 것", at: "2026-09-16T00:00:00Z" },
};
const pick = (filter: Partial<{ q: string; size: string; state: string }> = {}) =>
  selectGroups(GROUPS, VERDICTS, { q: "", size: "", state: "", ...filter }).map((g) => g.head);

test("크기 탭은 겹치지 않는다 — 한 묶음이 두 탭에 동시에 나오면 센 개수를 믿을 수 없다", () => {
  assert.deepEqual(pick({ size: "big" }), ["놀라다"]);
  assert.deepEqual(pick({ size: "mid" }), ["흠칫"]);
  assert.deepEqual(pick({ size: "solo" }), ["자혜롭다"]);
  assert.equal(pick({ size: "big" }).length + pick({ size: "mid" }).length + pick({ size: "solo" }).length,
    GROUPS.length, "세 탭을 합치면 전체가 된다");
});

test("검색은 대표뿐 아니라 식구와 영어 프롬프트에도 걸린다", () => {
  assert.deepEqual(pick({ q: "기겁하다" }), ["놀라다"], "식구로도 찾을 수 있어야 한다");
  assert.deepEqual(pick({ q: "SHOCKED" }), ["놀라다"], "프롬프트는 대소문자를 가리지 않는다");
  assert.deepEqual(pick({ q: "없는말" }), []);
});

test("판정 여부로 남은 일을 추릴 수 있다", () => {
  assert.deepEqual(pick({ state: "done" }), ["흠칫"]);
  assert.deepEqual(pick({ state: "todo" }), ["놀라다", "자혜롭다"]);
});

test("어휘등급 라벨은 범위를 벗어나도 무너지지 않는다", () => {
  assert.equal(levelLabel(0), "초급");
  assert.equal(levelLabel(9), "없음");
});

test("메모만 남긴 묶음은 아직 안 본 것으로 센다 — 피드백을 적었다고 판정이 되면 진행 수를 믿을 수 없다", () => {
  assert.equal(isJudged(VERDICTS["흠칫"]), true);
  assert.equal(isJudged(VERDICTS["자혜롭다"]), false, "메모만 있으면 판정이 아니다");
  assert.equal(isJudged(undefined), false);
  assert.deepEqual(pick({ state: "todo" }), ["놀라다", "자혜롭다"], "메모를 남겨도 할 일 목록에 남는다");
  assert.deepEqual(pick({ state: "done" }), ["흠칫"]);
});

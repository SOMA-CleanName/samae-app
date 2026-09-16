import assert from "node:assert/strict";
import { test } from "node:test";
import { AXES, AXIS_TONE, axisSpread, selectGroups, wordCount, type AxisGroup } from "./mood-axes";

const GROUPS: AxisGroup[] = [
  { head: "황혼", axes: ["시간대", "빛"], members: ["해거름", "저물녘"],
    prompts: ["dusk glow"], usage: "해 질 무렵 붉게 물든 하늘" },
  { head: "깜박이다", axes: ["빛", "에너지"], members: ["명멸"],
    prompts: ["blinking on and off"], usage: "불빛이 점멸하는 밤거리" },
  { head: "외롭다", axes: ["감정"], members: [], prompts: ["lonely and sad"], usage: "혼자 남은 사람의 뒷모습" },
];
const pick = (filter: Partial<{ axis: string; q: string; multi: boolean }> = {}) =>
  selectGroups(GROUPS, { axis: "", q: "", multi: false, ...filter }).map((g) => g.head);

test("축은 대등하다 — 어느 축을 골라도 그 축이 붙은 묶음은 모두 나온다", () => {
  assert.deepEqual(pick({ axis: "빛" }), ["황혼", "깜박이다"], "두 번째 축으로도 걸려야 한다");
  assert.deepEqual(pick({ axis: "시간대" }), ["황혼"]);
  assert.deepEqual(pick({ axis: "감정" }), ["외롭다"]);
});

test("검색은 대표뿐 아니라 식구와 영어 프롬프트에도 걸린다", () => {
  assert.deepEqual(pick({ q: "해거름" }), ["황혼"], "식구로도 찾을 수 있어야 한다");
  assert.deepEqual(pick({ q: "BLINKING" }), ["깜박이다"], "프롬프트는 대소문자를 가리지 않는다");
  assert.deepEqual(pick({ q: "없는말" }), []);
});

test("축과 검색은 함께 좁힌다", () => {
  assert.deepEqual(pick({ axis: "빛", q: "명멸" }), ["깜박이다"]);
  assert.deepEqual(pick({ axis: "감정", q: "명멸" }), [], "축이 다르면 검색어가 맞아도 빠진다");
});

test("다축만 보기는 축이 둘 이상인 묶음만 남긴다", () => {
  assert.deepEqual(pick({ multi: true }), ["황혼", "깜박이다"]);
  assert.deepEqual(pick({ multi: true, axis: "감정" }), [], "외롭다는 축이 하나라 빠진다");
});

test("낱말 수는 대표와 식구를 함께 센다 — 대표만 세면 5,176 이 나오지 않는다", () => {
  assert.equal(wordCount(GROUPS), 6, "대표 3 + 식구 3");
  assert.equal(wordCount([]), 0);
});

test("축 개수 분포로 다축이 실제로 쓰였는지 드러난다", () => {
  assert.deepEqual(axisSpread(GROUPS), [[1, 1], [2, 2]]);
});

test("축 11개에 모두 색이 있다 — 클래스가 비면 화면에서 구분이 사라진다", () => {
  assert.equal(AXES.length, 11);
  for (const axis of AXES) assert.ok(AXIS_TONE[axis], `${axis} 색 없음`);
});

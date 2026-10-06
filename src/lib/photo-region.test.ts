import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveRegion, regionsInText } from "./photo-region";

test("「서울」 만 적힌 사진은 서울이다 — 장소로는 못 붙이던 값", () => {
  assert.equal(deriveRegion("서울"), "서울");
  assert.equal(deriveRegion("서울 어딘가"), "서울");
  assert.equal(deriveRegion("서울숲"), "서울");
});

test("붙은 촬영 장소의 시·도로도 정한다", () => {
  assert.equal(deriveRegion("을지로 인쇄골목", ["서울"]), "서울");
  assert.equal(deriveRegion("경복궁, 창덕궁, 창경궁, 덕수궁", ["서울", "서울", "서울", "서울"]), "서울");
  assert.equal(deriveRegion("개항장 거리", ["인천"]), "인천");
});

test("둘 이상이면 비워 둔다 — 틀린 지역보다 빈칸이 낫다", () => {
  assert.equal(deriveRegion("서울, 경기"), null);
  assert.equal(deriveRegion("인천 개항장", ["서울"]), null);
});

test("시·도를 알 수 없으면 비운다", () => {
  assert.equal(deriveRegion("협의"), null);
  assert.equal(deriveRegion("수도권 내 협의 후 진행"), null);
  assert.equal(deriveRegion(null), null);
  assert.equal(deriveRegion("스튜디오"), null);
});

test("헷갈리는 이름은 광역 표기만 본다", () => {
  // 세종문화회관 · 세종대로는 서울이다
  assert.deepEqual(regionsInText("세종문화회관 앞"), []);
  assert.equal(deriveRegion("세종특별자치시 호수공원"), "세종");
  // 「광주」 만으론 경기 광주시와 갈린다
  assert.deepEqual(regionsInText("광주 곤지암"), []);
  assert.equal(deriveRegion("광주광역시 양림동"), "광주");
});

test("제주도 · 경기도 같은 표기도 알아본다", () => {
  assert.equal(deriveRegion("제주도 협재해변"), "제주");
  assert.equal(deriveRegion("경기도 가평"), "경기");
});

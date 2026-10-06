import { test } from "node:test";
import assert from "node:assert/strict";
import { locationMatchesSpot, usableSpotKeywords } from "./spot-match";

test("키워드가 들어 있으면 장소에 걸린다 — ilike '%키워드%' 와 같다", () => {
  assert.equal(locationMatchesSpot("을지로 인쇄골목", ["을지로"]), true);
  assert.equal(locationMatchesSpot("서울 중구 을지로3가", ["을지로"]), true);
  assert.equal(locationMatchesSpot("성수동 연무장길", ["성수", "연무장"]), true);
  assert.equal(locationMatchesSpot("연무장길 카페거리", ["성수", "연무장"]), true);
});

test("키워드가 없으면 안 걸린다", () => {
  assert.equal(locationMatchesSpot("서울숲", ["을지로"]), false);
  assert.equal(locationMatchesSpot(null, ["을지로"]), false);
  assert.equal(locationMatchesSpot("", ["을지로"]), false);
  assert.equal(locationMatchesSpot("을지로", []), false);
});

test("대소문자를 가리지 않는다 — ilike 처럼", () => {
  assert.equal(locationMatchesSpot("Seoul Forest", ["seoul forest"]), true);
  assert.equal(locationMatchesSpot("seoul forest", ["Seoul Forest"]), true);
});

test("콤마·괄호가 든 키워드는 DB 경로처럼 쓰지 않는다", () => {
  // DB 경로(orFilter)는 이런 키워드를 빼고 필터를 만든다. 메모리 경로가 이걸로 매칭하면
  // 두 경로가 다른 사진을 고르게 된다.
  assert.deepEqual(usableSpotKeywords(["을지로", "경복궁, 창덕궁", "덕수궁(정동)", " "]), ["을지로"]);
  assert.equal(locationMatchesSpot("경복궁, 창덕궁", ["경복궁, 창덕궁"]), false);
});

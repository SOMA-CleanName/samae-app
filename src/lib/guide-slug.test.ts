import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeSlug } from "./guide-slug";

// 2026-09-17 회귀. `/guide` 개별 문답 14개가 전부 404 였다 — generateStaticParams 가
// 슬러그를 미리 인코딩해 넘겨 이중 인코딩된 경로로 프리렌더됐고, 조회가 한 겹만 벗겨
// 아무것도 못 찾았다. 빌드도 통과하고 에러도 없어 신호가 하나도 없었다.

const SLUG = "친구가-찍어준-사진과-돈-주고-찍은-사진은-뭐가-다른가";

test("인코딩된 한글 슬러그를 원본으로 되돌린다 — 정상 경로", () => {
  assert.equal(decodeSlug(encodeURIComponent(SLUG)), SLUG);
});

test("이미 디코딩된 값은 그대로 둔다", () => {
  assert.equal(decodeSlug(SLUG), SLUG);
});

test("이중 인코딩도 푼다 — 이게 404 를 만들던 경우다", () => {
  assert.equal(decodeSlug(encodeURIComponent(encodeURIComponent(SLUG))), SLUG);
});

test("깨진 인코딩은 던지지 않고 받은 값을 돌려준다", () => {
  // `%` 뒤에 16진수가 아니면 decodeURIComponent 가 URIError 를 던진다.
  // 404 는 괜찮지만 500 은 안 된다 — 주소창에 아무나 칠 수 있는 값이다.
  assert.equal(decodeSlug("%ZZ-broken"), "%ZZ-broken");
  assert.doesNotThrow(() => decodeSlug("%"));
});

test("ASCII 슬러그는 건드리지 않는다", () => {
  assert.equal(decodeSlug("euljiro"), "euljiro");
});

test("풀이 횟수를 묶는다 — 끝없이 돌지 않는다", () => {
  // 세 겹이면 3회 안에 다 풀린다. 그보다 깊으면 덜 풀린 채로 나오고,
  // 그건 '못 찾음(404)' 이지 무한 루프가 아니다.
  const triple = encodeURIComponent(encodeURIComponent(encodeURIComponent(SLUG)));
  assert.doesNotThrow(() => decodeSlug(triple));
});

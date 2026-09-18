import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanEnglishPhrase, queryEnglishMessages, QUERY_ENGLISH_SHOTS } from "./search-query-english-core.ts";

test("모델 답에서 문구만 남긴다", () => {
  assert.equal(cleanEnglishPhrase("golden hour light"), "golden hour light");
  assert.equal(cleanEnglishPhrase('"golden hour light."'), "golden hour light");
  assert.equal(cleanEnglishPhrase("<think>생각</think>\n\nsunset glow"), "sunset glow", "think 블록을 걷어낸다");
  assert.equal(cleanEnglishPhrase("sunset glow\nThis means…"), "sunset glow", "첫 줄만");
});

test("한글이 섞이거나 비면 쓸 수 없는 답이다 — 한국어로 되돌아가야 한다", () => {
  assert.equal(cleanEnglishPhrase("노을 sunset"), null);
  assert.equal(cleanEnglishPhrase("   "), null);
});

test("예시 뒤에 검색어가 마지막 질문으로 붙는다", () => {
  const messages = queryEnglishMessages("노을");
  assert.equal(messages[0].role, "system");
  assert.equal(messages.length, 1 + QUERY_ENGLISH_SHOTS.length * 2 + 1);
  assert.deepEqual(messages.at(-1), { role: "user", content: "노을" });
});

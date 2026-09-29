import assert from "node:assert/strict";
import { test } from "node:test";
import { selectAuthorTags, summarizeAuthorTags } from "./mood-author-tags";

const photos = [
  { photographer_id: "a", mood_tags: ["감성", "빈티지", " 감성 "] },
  { photographer_id: "a", mood_tags: ["감성"] },
  { photographer_id: "b", mood_tags: ["일본 감성"] },
  { photographer_id: "b", mood_tags: null },
];
const profiles = [{ id: "c", mood_tags: ["감성", "몽환"] }];

test("사진 수 · 작가 수 · 프로필 수를 센다 — 한 사진의 같은 태그는 한 번", () => {
  const rows = summarizeAuthorTags(photos, profiles, new Set(["감성", "몽환"]));
  const by = new Map(rows.map((r) => [r.label, r]));
  assert.deepEqual(rows.map((r) => r.label), ["감성", "빈티지", "일본 감성", "몽환"], "사진 많은 순");
  assert.deepEqual({ ...by.get("감성") }, { label: "감성", photos: 2, photographers: 2, profiles: 1, inScreen: true });
  assert.equal(by.get("몽환")!.photos, 0);
  assert.equal(by.get("빈티지")!.inScreen, false);
});

test("띄어쓰기만 달라도 1차 전처리에 있으면 있는 것으로 본다", () => {
  const rows = summarizeAuthorTags(photos, [], new Set(["일본감성"]));
  assert.equal(rows.find((r) => r.label === "일본 감성")!.inScreen, true);
});

test("검색 · 없는 것만", () => {
  const rows = summarizeAuthorTags(photos, profiles, new Set(["감성"]));
  assert.deepEqual(selectAuthorTags(rows, { q: "", missing: true }).map((r) => r.label), ["빈티지", "일본 감성", "몽환"]);
  assert.deepEqual(selectAuthorTags(rows, { q: "빈", missing: false }).map((r) => r.label), ["빈티지"]);
});

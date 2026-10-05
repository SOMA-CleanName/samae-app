import assert from "node:assert/strict";
import { test } from "node:test";
import { addedTags, applyReview, bandOf, bandTop, BANDS, borderline, confirmedPhotos, inBand, latestConfirms, nextBand, cleanCaption, familyKoFor, planTranslation, hasHangul, countsAtCuts, droppedTags, familyCut, familyPromptsFor, latestReviews, v1KeyFor, parsePromptText, photosWithTag, samplePhotos, listTaggedPhotos, tagCounts, tagId, untaggedPhotos, type PhotoMoodTags } from "./mood-photo-tags";

const TAGS: PhotoMoodTags = {
  version: "v1", made_at: "2026-10-01", z_cut: 2, tag_bonus: 1.5, measured: {},
  photos: {
    a: { families: [["f01", 3.1, true], ["f02", 2.2, false]], moods: [["m01", 3.1]] },
    b: { families: [["f01", 2.5, false]], moods: [["m01", 2.5]] },
    c: { families: [], moods: [], near: [["f02", 1.9], ["f01", 1.2]] },
    d: { families: [], moods: [], near: [["f01", 1.5]] },
  },
};

test("뺀 태그 — 마지막 줄이 이기고 keep 은 되살리기다", () => {
  const dropped = droppedTags([
    { photo: "a", layer: "family", key: "f01", action: "drop", at: "1" },
    { photo: "b", layer: "family", key: "f01", action: "drop", at: "2" },
    { photo: "a", layer: "family", key: "f01", action: "keep", at: "3" },
  ]);
  assert.deepEqual([...dropped], [tagId("b", "family", "f01")]);
});

test("한 가족의 사진은 점수 순, 뺀 것도 표시해 돌려준다", () => {
  const dropped = new Set([tagId("b", "family", "f01")]);
  assert.deepEqual(photosWithTag(TAGS, "family", "f01", dropped), [
    { photo: "a", z: 3.1, byTag: true, dropped: false },
    { photo: "b", z: 2.5, byTag: false, dropped: true },
  ]);
  assert.deepEqual(photosWithTag(TAGS, "big", "m01", new Set()).map((r) => r.photo), ["a", "b"]);
});

test("장수는 뺀 것을 세지 않는다", () => {
  const dropped = new Set([tagId("b", "family", "f01")]);
  assert.deepEqual([...tagCounts(TAGS, "family", dropped)], [["f01", 1], ["f02", 1]]);
  assert.deepEqual([...tagCounts(TAGS, "big", dropped)], [["m01", 2]]);
});

test("표본은 같은 seed 면 같다", () => {
  assert.deepEqual(samplePhotos(TAGS, 2, 7), samplePhotos(TAGS, 2, 7));
  assert.equal(samplePhotos(TAGS, 5, 7).length, 4);
});

test("태그 없는 사진은 아깝게 놓친 것부터", () => {
  assert.deepEqual(untaggedPhotos(TAGS).map((r) => r.photo), ["c", "d"]);
});

test("사진별 목록 — 태그 많은 순 · 적은 순, 큰 무드로 거르고 뺀 태그는 세지 않는다", () => {
  assert.deepEqual(listTaggedPhotos(TAGS, new Set(), { sort: "many" }), ["a", "b", "c", "d"]);
  assert.deepEqual(listTaggedPhotos(TAGS, new Set(), { sort: "few" }), ["c", "d", "b", "a"]);
  assert.deepEqual(listTaggedPhotos(TAGS, new Set(), { sort: "many", big: "m01" }), ["a", "b"]);
  const dropped = new Set([tagId("a", "family", "f01"), tagId("a", "family", "f02")]);
  assert.deepEqual(listTaggedPhotos(TAGS, dropped, { sort: "many" }), ["b", "a", "c", "d"], "a 는 두 태그를 다 빼서 0개");
  assert.equal(listTaggedPhotos(TAGS, new Set(), { sort: "random", seed: 3 }).length, 4);
});

test("가족 문장 — 사람이 고친 마지막 줄이 초안을 이긴다 · 편집 칸은 줄마다 한 문장", () => {
  const drafts = { f01: { prompts: ["a photo of a"], by: "qwen", at: "1" } };
  assert.deepEqual(familyPromptsFor("f01", drafts, []), { prompts: ["a photo of a"], edited: false });
  assert.deepEqual(familyPromptsFor("f01", drafts, [{ key: "f01", prompts: ["x"], at: "1" }, { key: "f01", prompts: ["y"], at: "2" }]), { prompts: ["y"], edited: true });
  assert.deepEqual(parsePromptText("a photo of b.\n\n  a photo of c  \r\n"), ["a photo of b", "a photo of c"]);
});

test("가족 검수 — 판정과 기준은 따로, 기준은 가족마다 · 낮출 수도 있다, 큰 무드는 남은 가족에서 다시 물려받는다", () => {
  const reviews = latestReviews([
    { key: "f01", cut: 3.0, at: "1" },
    { key: "f01", status: "pass", at: "2" },
    { key: "f02", status: "pass", at: "1" },
    { key: "f02", status: "todo", at: "2" },
    { key: "f03", cut: 1.2, at: "1" },
    { key: "f03", cut: null, at: "2" },
  ]);
  assert.deepEqual(reviews.get("f01"), { cut: 3.0, status: "pass" }, "통과를 눌러도 기준이 남는다");
  assert.equal(reviews.has("f02"), false, "todo 는 판정 지우기");
  assert.equal(reviews.has("f03"), false, "cut null 은 기본으로");
  assert.equal(familyCut("f01", reviews, 1.5, 1.0), 3.0);
  assert.equal(familyCut("f09", latestReviews([{ key: "f09", cut: 0.5, at: "1" }]), 1.5, 1.0), 1.0, "저장된 바닥 아래로는 못 내린다");
  assert.equal(familyCut("f09", latestReviews([{ key: "f09", cut: 1.2, at: "1" }]), 1.5, 1.0), 1.2, "기본보다 낮출 수 있다");
  const bigOf = new Map([["f01", "m01"], ["f02", "m02"]]);
  const live = applyReview(TAGS, bigOf, { dropped: new Set(), reviews });
  assert.deepEqual(live.photos.a.families.map(([k]) => k), ["f01", "f02"], "a 의 f01 은 3.1 이라 남는다");
  assert.deepEqual(live.photos.b.families, [], "b 의 f01 은 2.5 라 기준 3.0 아래");
  assert.deepEqual(live.photos.b.moods, [], "가족이 없으니 큰 무드도 없다");
  assert.deepEqual(live.photos.a.moods, [["m01", 3.1], ["m02", 2.2]]);
});

test("기준별 남는 사진 수", () => {
  const rows = [{ photo: "x", z: 3, byTag: false, dropped: false }, { photo: "y", z: 1.6, byTag: false, dropped: false }, { photo: "w", z: 1.2, byTag: false, dropped: true }];
  assert.deepEqual(countsAtCuts(rows, [1.0, 1.5, 2.0]), [[1.0, 2], [1.5, 2], [2.0, 1]]);
});

test("경계 구간은 기준을 겨우 넘은 것부터", () => {
  const rows = [{ photo: "x", z: 3, byTag: false, dropped: false }, { photo: "y", z: 1.6, byTag: false, dropped: false }, { photo: "w", z: 1.2, byTag: false, dropped: false }];
  assert.deepEqual(borderline(rows, 1.5, 2).map((r) => r.photo), ["y", "x"]);
});

test("무드 화면 가족 → v1 키는 식구로 짝짓는다", () => {
  const layers = { version: "v1", frozen_at: "", moods: [], families: [
    { key: "f01", name: "a", name_by: "", big: "m01", bundles: ["노을", "일몰", "골든 아워"], words: [] },
    { key: "f02", name: "b", name_by: "", big: "m01", bundles: ["네온", "홍콩"], words: [] },
  ] };
  assert.equal(v1KeyFor(["노을", "일몰"], layers), "f01");
  assert.equal(v1KeyFor(["바다"], layers), null);
});

test("한글 줄만 골라 영어로 — 모델 답은 a photo of 로 시작하는 한 문장으로 정리", () => {
  assert.equal(hasHangul("노을 지는 해변"), true);
  assert.equal(hasHangul("a photo of a beach"), false);
  assert.equal(cleanCaption('"A photo of a couple at sunset."'), "a photo of a couple at sunset");
  assert.equal(cleanCaption("<think>x</think>\n1. a woman in a red dress"), "a photo of a woman in a red dress");
  assert.equal(cleanCaption("빨간 드레스"), null, "한글로 답하면 버린다");
  assert.equal(cleanCaption("a black and white photo of a man"), "a black and white photo of a man", "사진 꼴을 앞에 둔 것은 그대로");
});

test("한글 짝 — 고친 것이 초벌을 이기고, 영어가 따로 바뀌면 stale", () => {
  const drafts = { f01: { prompts_ko: ["벚꽃 사진"], from: ["a photo of cherry blossoms"], by: "c", at: "1" } };
  assert.deepEqual(familyKoFor("f01", ["a photo of cherry blossoms"], drafts, []),
    { lines: ["벚꽃 사진"], pairedEn: ["a photo of cherry blossoms"], edited: false, stale: false });
  assert.equal(familyKoFor("f01", ["a photo of tulips"], drafts, []).stale, true, "영어 칸을 따로 고쳤다");
  const edit = { key: "f01", prompts_ko: ["튤립 사진"], prompts_en: ["a photo of tulips"], at: "2" };
  assert.deepEqual(familyKoFor("f01", ["a photo of tulips"], drafts, [edit]).lines, ["튤립 사진"]);
});

test("바뀐 한글 줄만 다시 번역 — 그대로인 줄은 짝 영어를 그대로, 순서가 바뀌어도 내용으로 짝짓는다", () => {
  const plan = planTranslation(["작약 사진", "벚꽃 사진 ", "새 줄 사진"], ["벚꽃 사진", "작약 사진"], ["a photo of cherry blossoms", "a photo of peonies"]);
  assert.deepEqual(plan, [
    { ko: "작약 사진", keep: "a photo of peonies" },
    { ko: "벚꽃 사진 ", keep: "a photo of cherry blossoms" },
    { ko: "새 줄 사진", keep: null },
  ]);
});

test("단계별 소거 — 구간 · 확정 · 다음 구간", () => {
  assert.equal(bandTop(3.0), Infinity);
  assert.equal(bandTop(2.75), 3.0);
  assert.equal(bandOf(3.4), 3.0);
  assert.equal(bandOf(2.8), 2.75);
  assert.equal(bandOf(0.9), null);
  assert.equal(BANDS.at(-1), 1.0);
  const rows = [
    { photo: "a", z: 3.2, byTag: false, dropped: false },
    { photo: "b", z: 3.0, byTag: false, dropped: false },
    { photo: "c", z: 2.3, byTag: false, dropped: false },
  ];
  assert.deepEqual(inBand(rows, 3.0).map((r) => r.photo), ["a", "b"]);
  assert.equal(nextBand(rows), 3.0);
  const confirms = latestConfirms([
    { key: "f01", band: 3.0, photos: ["a", "b"], at: "1" },
    { key: "f01", band: 2.25, photos: ["c"], at: "2" },
    { key: "f01", band: 2.25, photos: null, at: "3" },
  ]);
  const done = new Set(confirmedPhotos("f01", confirms, new Set()));
  const open = rows.filter((r) => !done.has(r.photo));
  assert.equal(nextBand(open), 2.25, "확정한 a · b 를 빼면 2.75 · 2.5 는 비어 건너뛰고, 2.25 는 취소해서 c 가 남았다");
  assert.equal(nextBand([...open, { photo: "n", z: 3.1, byTag: false, dropped: false }]), 3.0, "통과한 구간이어도 새 사진이 들어오면 다시 본다");
  assert.equal(nextBand(open.map((r) => ({ ...r, dropped: true }))), null, "뺀 사진만 남으면 볼 것이 없다");
  assert.deepEqual(confirmedPhotos("f01", confirms, new Set(["b|family|f01"])), ["a"], "확정한 뒤 뺀 사진은 빠진다");
});

test("직접 붙인 태그 — 마지막 줄이 add 면 붙고, 점수가 없으면 기본 기준 점수로 싣는다 · 뒤에 빼면 빠진다", () => {
  const edits = [
    { photo: "c", layer: "family" as const, key: "f02", action: "add" as const, at: "1" },
    { photo: "a", layer: "family" as const, key: "f02", action: "add" as const, at: "1" },
    { photo: "a", layer: "family" as const, key: "f02", action: "drop" as const, at: "2" },
  ];
  const added = addedTags(edits);
  assert.deepEqual([...added], ["c|family|f02"]);
  const live = applyReview(TAGS, new Map([["f01", "m01"], ["f02", "m02"]]), { dropped: droppedTags(edits), reviews: new Map(), added });
  assert.deepEqual(live.photos.c.families, [["f02", 2, false]], "c 는 점수가 없던 f02 를 기본 기준(2) 점수로");
  assert.deepEqual(live.photos.c.moods, [["m02", 2]]);
  assert.deepEqual(live.photos.a.families.map(([k]) => k), ["f01"], "a 의 f02 는 붙였다 뺐다");
});

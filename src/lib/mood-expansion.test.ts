import assert from "node:assert/strict";
import { test } from "node:test";
import { findMoodBundles, moodTiers, normMoodWord, rankByMoodTiers, type MoodSearchMap } from "./mood-expansion";

// 묶음 0 노을 ≈ 1 일몰(무리) · 가족 0 = {0,1,2 골든 아워} · 이웃 0 → 3 따뜻한 색감 · 큰 무드 0 = 가족 0 + 가족 1 {3, 4 햇살}
// 묶음 5 비 오는 날은 다른 큰 무드
const words = [["노을", "노을빛"], ["일몰"], ["골든 아워"], ["따뜻한 색감"], ["햇살"], ["비 오는 날"]];
const M: MoodSearchMap = {
  heads: words.map((w) => w[0]),
  terms: Object.fromEntries(words.flatMap((ws, id) => ws.map((w) => [normMoodWord(w), id]))),
  words,
  cluster: [[1], [0], [], [], [], []],
  family: [0, 0, 0, 1, 1, 2],
  families: [[0, 1, 2], [3, 4], [5]],
  big: [0, 0, 1],
  moods: [[0, 1], [2]],
  near: [[3], [], [], [0], [], []],
};

test("무드 글에서 묶음을 찾는다 — 글 전체, 흡수된 표기, 꼬리말을 뗀 꼴", () => {
  assert.deepEqual(findMoodBundles("비 오는 날", M), [5], "띄어 쓴 말도 통째로");
  assert.deepEqual(findMoodBundles("노을빛", M), [0], "흡수된 옛 표기");
  assert.deepEqual(findMoodBundles("햇살 노을", M), [4, 0], "낱말마다");
  assert.deepEqual(findMoodBundles("일몰적인", M), [1], "꼬리말 떼기");
  assert.deepEqual(findMoodBundles("모르는말", M), []);
});

test("층별 말 — 앞 층에 나온 묶음은 뒤에서 빠진다", () => {
  assert.deepEqual(moodTiers(0, M), [
    { tier: "묶음", words: ["노을", "노을빛"] },
    { tier: "무리", words: ["일몰"] },
    { tier: "가족", words: ["골든 아워"] },
    { tier: "이웃", words: ["따뜻한 색감"] },
    { tier: "큰 무드", words: ["햇살"] },
  ]);
});

const photo = (id: string, ...tags: string[]) => ({ id, mood_tags: tags, generated_tags: [] });

test("층 순서로 서고, 묶음 · 무리는 늘 · 가족부터는 room 까지만 · 큰 무드는 태그로 넓히지 않는다", () => {
  const photos = [photo("p햇살", "햇살"), photo("p골든", "골든 아워"), photo("p일몰", "일몰"), photo("p노을", "노을빛"), photo("p비", "비 오는 날")];
  const ranked = (room: number) => rankByMoodTiers(photos, [0], { room, m: M }).map((r) => `${r.photo.id}:${r.tier}`);
  assert.deepEqual(ranked(10), ["p노을:묶음", "p일몰:무리", "p골든:가족"], "p햇살 은 큰 무드라 빠진다");
  assert.deepEqual(ranked(3), ["p노을:묶음", "p일몰:무리", "p골든:가족"], "room 3 — 묶음 · 무리 2장 뒤 1장만 더");
  assert.deepEqual(ranked(0), ["p노을:묶음", "p일몰:무리"], "room 이 없어도 같은 말은 넣는다");
});

test("넓힌 말은 태그와 정확히 같을 때만 — 부분 일치는 안 된다", () => {
  const ranked = rankByMoodTiers([photo("a", "노을 사진"), photo("b", "골든 아워")], [0], { room: 10, m: M });
  assert.deepEqual(ranked.map((r) => r.photo.id), ["b"]);
});

test("이미 나온 사진은 빼고, 낱말이 여럿이면 모두 맞아야 한다(층은 가장 먼 쪽)", () => {
  const photos = [photo("a", "노을", "햇살"), photo("b", "노을"), photo("c", "일몰", "햇살"), photo("d", "비 오는 날")];
  const ranked = rankByMoodTiers(photos, [0, 4], { room: 10, m: M, exclude: new Set(["a"]) });
  assert.deepEqual(ranked.map((r) => `${r.photo.id}:${r.tier}`), ["c:무리"],
    "c — 노을 쪽 무리 · 햇살 쪽 묶음 → 무리 / b — 햇살 쪽엔 큰 무드로만 맞아 빠진다 / d — 어느 쪽에도 안 맞는다");
});

test("흔한 태그는 가족부터의 층에서 쓰지 않는다 — 같은 말(묶음 · 무리)은 흔해도 쓴다", () => {
  const filler = Array.from({ length: 40 }, (_, i) => photo(`x${i}`, "기타"));
  const golden = Array.from({ length: 25 }, (_, i) => photo(`g${i}`, "골든 아워"));
  const sunset = Array.from({ length: 25 }, (_, i) => photo(`s${i}`, "일몰"));
  const ranked = rankByMoodTiers([...filler, ...golden, ...sunset], [0], { room: 200, m: M });
  assert.equal(ranked.filter((r) => r.tier === "가족").length, 0, "골든 아워 25장(28%) — 흔해서 넓히는 데 안 쓴다");
  assert.equal(ranked.filter((r) => r.tier === "무리").length, 25, "일몰 25장 — 거의 같은 말이라 흔해도 쓴다");
});

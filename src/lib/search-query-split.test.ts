import assert from "node:assert/strict";
import test from "node:test";
import {
  arrangeFamilyPhotos,
  dropDuplicatePhotos,
  fillFamilyOrder,
  planMoodSearch,
  purposeMoodSuggestions,
  parseSearchQueryResponse,
  requestSearchQuery,
  SIGLIP_EMBED_DIM,
  SIGLIP_TEXT_MODEL,
  SEARCH_MATCH_Z,
  SEARCH_RELATED_Z,
  GENDER_BOUNDARY,
  pickByGender,
  splitByPurposes,
  splitByZ,
  spreadAlbumsInBands,
} from "./siglip-text-search-core.ts";

const vector = Array.from({ length: SIGLIP_EMBED_DIM }, () => 0.01);
const answer = (body: object) => ({ model: SIGLIP_TEXT_MODEL, matched: [], ...body });

test("목적과 무드가 둘 다 오면 그대로 받는다", () => {
  const parsed = parseSearchQueryResponse(answer({ purposes: ["couple"], mood_text: "가을", vector }));
  assert.deepEqual(parsed?.purposes, ["couple"]);
  assert.equal(parsed?.moodText, "가을");
  assert.equal(parsed?.vector?.length, SIGLIP_EMBED_DIM);
});

test("목적만 검색하면 벡터가 없어도 된다", () => {
  const parsed = parseSearchQueryResponse(answer({ purposes: ["wedding"], mood_text: "", vector: null }));
  assert.deepEqual(parsed, { purposes: ["wedding"], gender: null, details: [], moodText: "", vector: null });
});

test("성별은 개인 검색일 때 맥미니가 준다 — 갱신 전 맥미니는 없으니 null", () => {
  const woman = parseSearchQueryResponse(answer({ purposes: ["personal"], gender: "female", mood_text: "", vector: null }));
  assert.equal(woman?.gender, "female");
  const old = parseSearchQueryResponse(answer({ purposes: ["personal"], mood_text: "여자", vector }));
  assert.equal(old?.gender, null);
  const odd = parseSearchQueryResponse(answer({ purposes: ["personal"], gender: "other", mood_text: "", vector: null }));
  assert.equal(odd?.gender, null, "모르는 값은 성별 필터를 쓰지 않는다");
});

test("쓸 수 없는 응답은 버린다", () => {
  assert.equal(parseSearchQueryResponse(answer({ purposes: ["couple"], mood_text: "가을", vector: null })), null,
    "무드 글자가 있는데 벡터가 없다");
  assert.equal(parseSearchQueryResponse(answer({ purposes: ["family"], mood_text: "", vector: null })), null,
    "모르는 목적 키");
  assert.deepEqual(parseSearchQueryResponse(answer({ purposes: [], mood_text: "", vector: null }))?.purposes, [],
    "목적도 무드도 없으면(\"스냅\") 전체 사진을 찾는 것이다");
  assert.equal(parseSearchQueryResponse({ purposes: [], mood_text: "노을", vector, model: "other" }), null,
    "다른 모델의 벡터는 사진 벡터와 비교할 수 없다");
});

test("갱신 전 맥미니는 404·501 — 예전 방식으로 돌아가라는 신호를 준다", async () => {
  for (const status of [404, 501]) {
    const fetcher = (async () => new Response("{}", { status })) as typeof fetch;
    assert.equal(await requestSearchQuery("가을", { baseUrl: "http://x", fetcher }), "unsupported");
  }
  const broken = (async () => new Response("{}", { status: 500 })) as typeof fetch;
  assert.equal(await requestSearchQuery("가을", { baseUrl: "http://x", fetcher: broken }), null, "장애는 장애다");
});

test("검색어를 맥미니 /search-query 로 보낸다", async () => {
  let called = "";
  let sent: unknown = null;
  const fetcher = (async (url: string, init: RequestInit) => {
    called = url;
    sent = JSON.parse(String(init.body));
    return Response.json(answer({ purposes: ["couple"], mood_text: "가을", vector }));
  }) as unknown as typeof fetch;
  const parsed = await requestSearchQuery("  가을 커플스냅 ", { baseUrl: "http://mac/", fetcher });
  assert.equal(called, "http://mac/search-query");
  assert.deepEqual(sent, { query: "가을 커플스냅" });
  assert.notEqual(parsed, null);
});

test("목적이 맞는 사진을 위로, 나머지는 아래로 — 각자 순서는 그대로", () => {
  const photos = [
    { id: "a", admin_purposes: ["personal"] },
    { id: "b", admin_purposes: ["couple"] },
    { id: "c", admin_purposes: ["wedding", "couple"] },
    { id: "d", admin_purposes: [] },
  ];
  const { matches, related } = splitByPurposes(photos, ["couple"]);
  assert.deepEqual(matches.map((p) => p.id), ["b", "c"]);
  assert.deepEqual(related.map((p) => p.id), ["a", "d"]);
});

test("목적이 없으면 전부 위쪽이다", () => {
  const { matches, related } = splitByPurposes([{ id: "a", admin_purposes: ["pet"] }], []);
  assert.deepEqual(matches.map((p) => p.id), ["a"]);
  assert.deepEqual(related, []);
});

test("z 2.5 이상은 검색 결과, 그 아래는 비슷한 무드 — 각자 점수순 그대로", () => {
  const scored = [
    { id: "a", z: 3.4 }, { id: "b", z: 2.5 }, { id: "c", z: 2.49 }, { id: "d", z: 2.0 },
  ];
  const { matches, related } = splitByZ(scored);
  assert.deepEqual(matches.map((p) => p.id), ["a", "b"], "경계값 2.5 는 검색 결과");
  assert.deepEqual(related.map((p) => p.id), ["c", "d"]);
  assert.ok(SEARCH_RELATED_Z < SEARCH_MATCH_Z);
});

test("앨범 흩뜨리기는 장수를 자르지 않는다 — z 로 자른 결과를 또 자르면 안 된다", () => {
  const photos = Array.from({ length: 420 }, (_, i) => ({
    id: `p${i}`, width: 3, height: 4, album_id: `album${i % 5}`,
  }));
  const spread = spreadAlbumsInBands(photos);
  assert.equal(spread.length, 420, "300장에서 자르던 diversifySearchResults 와 다르다");
  assert.deepEqual(new Set(spread.map((p) => p.id)).size, 420);
  assert.notEqual(spread[0].album_id, spread[1].album_id, "같은 앨범이 연달아 오지 않는다");
});

test("성별은 여자·남자 중 어느 쪽에 가까운지로 가른다 — 점수 순위로 자르지 않는다", () => {
  // womanLean = 남자까지 거리 − 여자까지 거리
  const female = [
    { id: "w1", distance: 0.80 },  // lean 0.03 → 여자
    { id: "w2", distance: 0.90 },  // lean 0.01 → 여자 (여자 점수는 낮아도 여자 쪽이다)
    { id: "m1", distance: 0.85 },  // lean -0.02 → 남자
    { id: "edge", distance: 0.80 }, // lean 0.004 → 경계 아래라 남자
  ];
  const male = [
    { id: "w1", distance: 0.83 }, { id: "w2", distance: 0.91 },
    { id: "m1", distance: 0.83 }, { id: "edge", distance: 0.804 },
  ];
  assert.deepEqual(pickByGender(female, male, "female").map((r) => r.id), ["w1", "w2"]);
  assert.deepEqual(pickByGender(female, male, "male").map((r) => r.id), ["edge", "m1"], "남자와 가까운 순서");
  assert.ok(GENDER_BOUNDARY > 0);
});

test("한쪽 목록에만 있는 사진은 가르지 않는다", () => {
  assert.deepEqual(pickByGender([{ id: "a", distance: 0.8 }], [], "female"), []);
});

test("세부분류는 함께 온 목적의 것만 받는다", () => {
  const parsed = parseSearchQueryResponse(answer({
    purposes: ["event"], details: ["event.maternity", "wedding.ceremony", "event.maternity", "bad key"],
    mood_text: "", vector: null,
  }));
  assert.deepEqual(parsed?.details, ["event.maternity"]);
  const old = parseSearchQueryResponse(answer({ purposes: ["event"], mood_text: "", vector: null }));
  assert.deepEqual(old?.details, [], "갱신 전 맥미니는 세부분류를 안 준다");
});

test("목적은 전부 있어야 한다 — 커플 강아지는 커플이면서 강아지", async () => {
  const { matchesSearchTags } = await import("./siglip-text-search-core.ts");
  const both = { admin_purposes: ["couple", "pet"], admin_purpose_details: ["couple.snap", "pet.dog"] };
  const coupleOnly = { admin_purposes: ["couple"], admin_purpose_details: ["couple.snap"] };
  assert.equal(matchesSearchTags(both, { purposes: ["couple", "pet"] }), true);
  assert.equal(matchesSearchTags(coupleOnly, { purposes: ["couple", "pet"] }), false);
});

test("세부분류는 같은 목적 안에서 하나라도 — 돌잔치 가족사진은 둘 다", async () => {
  const { matchesSearchTags } = await import("./siglip-text-search-core.ts");
  const tags = { purposes: ["event"], details: ["event.first_birthday", "event.family"] };
  assert.equal(matchesSearchTags({ admin_purposes: ["event"], admin_purpose_details: ["event.family"] }, tags), true);
  assert.equal(matchesSearchTags({ admin_purposes: ["event"], admin_purpose_details: ["event.first_birthday"] }, tags), true);
  assert.equal(matchesSearchTags({ admin_purposes: ["event"], admin_purpose_details: ["event.graduation"] }, tags), false);
});

test("목적이 다른 세부분류는 목적마다 따로 — 가족 강아지는 가족사진이면서 강아지", async () => {
  const { matchesSearchTags } = await import("./siglip-text-search-core.ts");
  const tags = { purposes: ["pet", "event"], details: ["event.family", "pet.dog"] };
  assert.equal(matchesSearchTags({ admin_purposes: ["pet", "event"], admin_purpose_details: ["event.family", "pet.dog"] }, tags), true);
  assert.equal(matchesSearchTags({ admin_purposes: ["pet", "event"], admin_purpose_details: ["event.family", "pet.cat"] }, tags), false);
});

test("성별은 있으면 맞아야 한다", async () => {
  const { matchesSearchTags } = await import("./siglip-text-search-core.ts");
  const woman = { admin_purposes: ["personal"], admin_purpose_gender: "female" };
  assert.equal(matchesSearchTags(woman, { purposes: ["personal"], gender: "female" }), true);
  assert.equal(matchesSearchTags(woman, { purposes: ["personal"], gender: "male" }), false);
});

test("포트폴리오가 뭉치지 않게 전체에 고르게 — 큰 포트폴리오가 뒤에 몰리지 않는다", async () => {
  const { spreadPortfolios } = await import("./siglip-text-search-core.ts");
  const make = (album: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${album}${i}`, album_id: album }));
  const photos = [...make("big", 40), ...make("mid", 10), ...make("s1", 3), ...make("s2", 3), ...make("s3", 2)];
  const out = spreadPortfolios(photos);
  assert.equal(out.length, photos.length);
  const tail = out.slice(-12).map((p) => p.album_id);
  assert.ok(new Set(tail).size > 1, `뒤 12장이 한 포트폴리오만: ${tail}`);
  const bigAt = out.map((p, i) => (p.album_id === "big" ? i : -1)).filter((i) => i >= 0);
  assert.ok(bigAt[0] < 5 && bigAt.at(-1)! > out.length - 5, "큰 포트폴리오가 처음부터 끝까지 퍼진다");
  const inAlbum = out.filter((p) => p.album_id === "mid").map((p) => p.id);
  assert.deepEqual(inAlbum, make("mid", 10).map((p) => p.id), "포트폴리오 안의 순서는 그대로");
  assert.deepEqual(spreadPortfolios(photos), out, "같은 결과면 같은 순서");
});

test("목적마다 1~4장씩 무리 지어 번갈아 — 겹치는 사진은 한 번만, 빠지는 사진 없음", async () => {
  const { interleaveGroups } = await import("./siglip-text-search-core.ts");
  const couple = Array.from({ length: 40 }, (_, i) => ({ id: `c${i}` }));
  const pet = [...Array.from({ length: 10 }, (_, i) => ({ id: `p${i}` })), { id: "c3" }];
  const out = interleaveGroups([couple, pet]).map((x) => x.id);
  assert.equal(out.length, 50, "겹친 c3 는 한 번만");
  assert.equal(new Set(out).size, 50);
  // 같은 무리가 연달아 나오는 길이 — 1~4장(한쪽이 바닥나면 나머지는 몰아서)
  const runs: number[] = [];
  let run = 1;
  const side = (id: string) => (id.startsWith("p") ? "p" : "c");
  for (let i = 1; i < 20; i += 1) {
    if (side(out[i]) === side(out[i - 1])) run += 1;
    else { runs.push(run); run = 1; }
  }
  assert.ok(runs.every((r) => r >= 1 && r <= 4), `앞쪽 묶음 ${runs}`);
  assert.ok(new Set(runs).size > 1, "묶음 크기가 흔들린다");
});

test("같은 결과면 늘 같은 순서 — 새로고침에 자리가 안 바뀐다", async () => {
  const { interleaveGroups } = await import("./siglip-text-search-core.ts");
  const a = Array.from({ length: 12 }, (_, i) => ({ id: `a${i}` }));
  const b = Array.from({ length: 12 }, (_, i) => ({ id: `b${i}` }));
  assert.deepEqual(interleaveGroups([a, b]), interleaveGroups([a, b]));
});

test("무드 가족 — 가까운 사진 뼈대 검색어가 든 가족을 받는다(docs/47 §9) · 틀린 꼴은 버리고 없으면 칸도 없다", () => {
  const parsed = parseSearchQueryResponse(answer({
    purposes: [], mood_text: "비 오는 날", vector,
    mood_families: [{ key: "f07", score: 1, term: "비 오는 날" }, { key: "x", score: 0.9 }, { key: "f43", score: "높음" }],
  }));
  assert.deepEqual(parsed?.moodFamilies, [{ key: "f07", score: 1, term: "비 오는 날" }]);
  assert.equal(parseSearchQueryResponse(answer({ purposes: [], mood_text: "비", vector, mood_families: [] }))?.moodFamilies, undefined);
});

test("가족 결과 줄 세우기 — 고른 가족에 많이 든 사진부터, 숨은 사진은 버리고, 목적 없으면 개인 먼저", () => {
  const row = (id: string, album: string, purposes: string[]) => ({ id, album_id: album, admin_purposes: purposes });
  const rows = [
    row("a", "A", ["couple"]), row("b", "A", ["personal"]), row("c", "B", ["personal"]),
    row("d", "C", ["couple"]), row("e", "C", ["personal"]),
  ];
  const families = [["a", "b", "c", "hidden"], ["c", "d", "e"]];
  const mixed = arrangeFamilyPhotos(families, rows, { personalFirst: false });
  assert.equal(mixed[0].id, "c", "두 가족에 다 든 c 가 맨 위");
  assert.deepEqual(new Set(mixed.map((r) => r.id)), new Set(["a", "b", "c", "d", "e"]), "숨은 사진은 빠지고 한 번씩만");
  const personal = arrangeFamilyPhotos(families, rows, { personalFirst: true });
  assert.deepEqual(personal.slice(0, 3).map((r) => r.admin_purposes?.[0]), ["personal", "personal", "personal"]);
  assert.equal(personal[0].id, "c", "개인 안에서도 겹친 사진이 먼저");
});

test("검색 계획 — 정확하면 가족만, 애매하면 큰 무드 전체 · 연관 검색어는 같은 큰 무드 가족 먼저, 그 뒤 비슷한 것", () => {
  const layers = {
    names: { f07: "비 오는 날", f51: "차분한", f80: "잔잔한", f84: "아늑한", f83: "편안한", f06: "겨울", f43: "고요한" },
    big: { f07: "m01", f51: "m01", f80: "m01", f84: "m10", f83: "m10", f06: "m25", f43: "m25" },
    moods: [
      { key: "m01", name: "차분한", families: ["f07", "f51", "f80"] },
      { key: "m10", name: "포근·아늑", families: ["f84", "f83"] },
      { key: "m25", name: "겨울", families: ["f06", "f43"] },
    ],
  };
  const scores = { f07: 1, f51: 0.6, f80: 0.7, f84: 0.5, f83: 0.4, f06: 0.81, f43: 0.62 };
  const exact = planMoodSearch([{ key: "f07", score: 1, term: "비 오는 날" }], scores, layers, "비 오는 날");
  assert.equal(exact.mode, "family");
  assert.deepEqual(exact.secondary, []);
  assert.deepEqual(exact.suggestions.map((s) => s.label), ["잔잔한", "차분한", "겨울", "고요한", "포근·아늑", "아늑한"],
    "같은 큰 무드 가족(가까운 순) → 비슷한 큰 무드 · 가족(가까운 순), 겨울은 큰 무드 · 가족 이름이 같아 한 번만");

  const vague = planMoodSearch([{ key: "f84", score: 0.78, term: "아늑한" }], scores, layers, "고즈넉한");
  assert.equal(vague.mode, "big");
  assert.deepEqual(vague.primary, ["f84"]);
  assert.deepEqual(vague.secondary, ["f83"], "같은 큰 무드의 나머지 가족이 뒤에 붙는다");
});

test("목적만 검색한 연관 무드 — 커플은 그 목적 사진이 많은 가족 순, 개인 · 목적 없음은 고른 무드", () => {
  const index = { photos: ["a", "b", "c"], families: { f19: [0, 1], f52: [2], f85: [0, 1, 2] }, names: { f19: "로맨스", f52: "설렘", f85: "감성", f91: "청순" } };
  assert.deepEqual(purposeMoodSuggestions(["couple"], [{ id: "a" }, { id: "b" }, { id: "c" }], index).map((s) => s.label), ["감성", "로맨스", "설렘"],
    "커플 사진이 많이 든 가족 순(3 · 2 · 1)");
  assert.deepEqual(purposeMoodSuggestions(["couple"], [{ id: "c" }], index).map((s) => s.label), ["설렘", "감성"], "커플 사진이 없는 가족은 빠진다 · 같은 수면 번호 순");
  const personal = purposeMoodSuggestions(["personal"], [], index).map((s) => s.label);
  assert.deepEqual(personal, ["감성", "청순"], "고른 무드 중 색인에 이름이 있는 것만, 고른 순서대로");
  assert.deepEqual(purposeMoodSuggestions([], [], index).map((s) => s.label), personal, "목적 없음(스냅)도 개인과 같다");
});

test("같은 사진은 한 번만 — 먼저 나온 한 장이 남고, 위에 나온 사진은 아래에서도 빠진다", () => {
  const dup = { b: "a", c: "a" };
  const rows = [{ id: "c" }, { id: "x" }, { id: "a" }, { id: "b" }];
  assert.deepEqual(dropDuplicatePhotos(rows, dup).map((r) => r.id), ["c", "x"], "a 묶음은 먼저 나온 c 하나만");
  assert.deepEqual(dropDuplicatePhotos([{ id: "b" }, { id: "y" }], dup, ["c"]).map((r) => r.id), ["y"], "위에 c 가 나왔으니 b 도 뺀다");
});

test("채울 가족 — 같은 큰 무드 먼저, 그 뒤 가까운 순, 쓴 가족과 먼 가족은 뺀다", () => {
  const layers = { names: { f57: "몽환", f30: "신비주의", f38: "동화 속", f66: "다크", f12: "귀여운" }, big: { f57: "m22", f30: "m22", f38: "m22", f66: "m14", f12: "m06" }, moods: [] };
  assert.deepEqual(fillFamilyOrder(["f57"], { f57: 1, f30: 0.5, f38: 0.7, f66: 0.9, f12: 0.3 }, layers), ["f38", "f30", "f66"]);
});

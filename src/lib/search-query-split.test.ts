import assert from "node:assert/strict";
import test from "node:test";
import {
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

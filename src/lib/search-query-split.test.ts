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
  assert.equal(parseSearchQueryResponse(answer({ purposes: [], mood_text: "", vector: null })), null,
    "목적도 무드도 없다");
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

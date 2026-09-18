import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSearchQueryResponse,
  requestSearchQuery,
  SIGLIP_EMBED_DIM,
  SIGLIP_TEXT_MODEL,
  splitByNearest,
  splitByPurposes,
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
  assert.deepEqual(parsed, { purposes: ["wedding"], moodText: "", vector: null });
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

test("목적 사진을 전체 상위에 든 것(위)과 나머지(아래)로 — 둘 다 목적 사진, 각자 거리순", () => {
  const inPurpose = [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }];
  const { matches, related } = splitByNearest(inPurpose, new Set(["c1", "c3", "x9"]));
  assert.deepEqual(matches.map((p) => p.id), ["c1", "c3"]);
  assert.deepEqual(related.map((p) => p.id), ["c2", "c4"]);
});

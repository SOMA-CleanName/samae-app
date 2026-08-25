import assert from "node:assert/strict";
import test from "node:test";
import {
  orderByVectorIds,
  parseTextEmbeddingResponse,
  requestTextEmbedding,
} from "./siglip-text-search-core.ts";

test("accepts one finite 1152-dimensional SigLIP2 text vector", () => {
  const vector = Array.from({ length: 1152 }, (_, index) => index / 1152);

  assert.deepEqual(
    parseTextEmbeddingResponse({
      model: "google/siglip2-so400m-patch16-naflex",
      vectors: [vector],
    }),
    vector
  );
});

test("rejects wrong model, dimensions, non-finite values, and multiple vectors", () => {
  const vector = Array.from({ length: 1152 }, () => 0.1);
  const nonFinite = [...vector];
  nonFinite[50] = Number.NaN;

  assert.equal(parseTextEmbeddingResponse(null), null);
  assert.equal(parseTextEmbeddingResponse({ model: "wrong", vectors: [vector] }), null);
  assert.equal(
    parseTextEmbeddingResponse({
      model: "google/siglip2-so400m-patch16-naflex",
      vectors: [[1, 2]],
    }),
    null
  );
  assert.equal(
    parseTextEmbeddingResponse({
      model: "google/siglip2-so400m-patch16-naflex",
      vectors: [nonFinite],
    }),
    null
  );
  assert.equal(
    parseTextEmbeddingResponse({
      model: "google/siglip2-so400m-patch16-naflex",
      vectors: [vector, vector],
    }),
    null
  );
});

test("restores RPC distance order after an unordered metadata query", () => {
  const rows = [
    { id: "b", title: "second" },
    { id: "a", title: "unused" },
    { id: "c", title: "first" },
  ];

  assert.deepEqual(orderByVectorIds(rows, ["c", "b", "missing"]), [
    { id: "c", title: "first" },
    { id: "b", title: "second" },
  ]);
});

test("requests the authenticated embed-text endpoint and returns its vector", async () => {
  const vector = Array.from({ length: 1152 }, () => 0.25);
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(
      JSON.stringify({
        model: "google/siglip2-so400m-patch16-naflex",
        vectors: [vector],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const result = await requestTextEmbedding("  푸른 숲속 커플  ", {
    baseUrl: "https://embed.example.com/",
    token: "secret",
    fetcher,
  });

  assert.deepEqual(result, vector);
  assert.equal(capturedUrl, "https://embed.example.com/embed-text");
  assert.equal(new Headers(capturedInit?.headers).get("x-samae-token"), "secret");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    texts: ["푸른 숲속 커플"],
  });
});

test("returns null without a service URL or for failed and malformed responses", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return new Response(JSON.stringify({ vectors: [[1, 2]] }), { status: 200 });
  };

  assert.equal(
    await requestTextEmbedding("검색", { baseUrl: null, fetcher }),
    null
  );
  assert.equal(calls, 0);
  assert.equal(
    await requestTextEmbedding("검색", {
      baseUrl: "https://embed.example.com",
      fetcher,
    }),
    null
  );
  assert.equal(calls, 1);
});

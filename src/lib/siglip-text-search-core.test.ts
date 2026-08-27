import assert from "node:assert/strict";
import test from "node:test";
import {
  diversifySearchResults,
  hasOrientationIntent,
  mergeMetadataAndVectorResults,
  normalizeSiglipSearchLimit,
  orderByVectorIds,
  orderVectorMatches,
  parseTextEmbeddingResponse,
  requestTextEmbedding,
} from "./siglip-text-search-core.ts";

type DiversityPhoto = {
  id: string;
  width: number;
  height: number;
  album_id: string | null;
  distance?: number;
};

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

test("preserves album metadata and attaches RPC distance while restoring vector order", () => {
  const rows = [
    { id: "b", album_id: "album-b" },
    { id: "a", album_id: "album-a" },
    { id: "c", album_id: "album-c" },
  ];

  assert.deepEqual(
    orderVectorMatches(rows, [
      { id: "c", distance: 0.11 },
      { id: "b", distance: 0.19 },
      { id: "missing", distance: 0.3 },
    ]),
    [
      { id: "c", album_id: "album-c", distance: 0.11 },
      { id: "b", album_id: "album-b", distance: 0.19 },
    ]
  );
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

test("clamps SigLIP2 search results to the 300-photo infinite-scroll pool", () => {
  assert.equal(normalizeSiglipSearchLimit(48), 48);
  assert.equal(normalizeSiglipSearchLimit(999), 300);
  assert.equal(normalizeSiglipSearchLimit(0), 1);
});

test("promotes metadata matches before SigLIP results without duplicates", () => {
  const metadata = [
    { id: "metadata-only", source: "metadata" },
    { id: "shared", source: "metadata" },
  ];
  const vector = [
    { id: "shared", source: "vector" },
    { id: "visual-first", source: "vector" },
    { id: "visual-second", source: "vector" },
  ];

  assert.deepEqual(mergeMetadataAndVectorResults(metadata, vector, 3), [
    { id: "metadata-only", source: "metadata" },
    { id: "shared", source: "metadata" },
    { id: "visual-first", source: "vector" },
  ]);
});

test("keeps the full pool while mixing vector-only spacers into the first relevance band", () => {
  const metadata: DiversityPhoto[] = Array.from({ length: 48 }, (_, index) => ({
    id: `direct-${index}`,
    width: 800,
    height: 1200,
    album_id: "repeated-direct-album",
  }));
  const vector: DiversityPhoto[] = [
    ...metadata.map((photo, index) => ({
      ...photo,
      distance: 0.1 + index * 0.001,
    })),
    ...Array.from({ length: 12 }, (_, index) => ({
      id: `visual-spacer-${index}`,
      width: 800,
      height: 1200,
      album_id: `visual-album-${index}`,
      distance: 0.11 + index * 0.001,
    })),
  ];

  const result = diversifySearchResults("가을 인물", metadata, vector);

  assert.equal(result.length, 60);
  assert.equal(
    result.slice(0, 48).some((photo) => photo.id.startsWith("visual-spacer-")),
    true
  );
});

test("orders direct metadata matches by their real SigLIP distance", () => {
  const metadata: DiversityPhoto[] = [
    { id: "direct-far", width: 800, height: 1200, album_id: "far-album" },
    { id: "direct-near", width: 800, height: 1200, album_id: "near-album" },
  ];
  const vector: DiversityPhoto[] = [
    { ...metadata[1], distance: 0.1 },
    {
      id: "close-visual",
      width: 800,
      height: 1200,
      album_id: "close-album",
      distance: 0.11,
    },
    { ...metadata[0], distance: 0.2 },
  ];

  const result = diversifySearchResults("가을 인물", metadata, vector);

  assert.equal(result[0]?.id, "direct-near");
  assert.equal(result.length, 3);
});

test("detects explicit orientation searches without mistaking place names for direction", () => {
  assert.equal(hasOrientationIntent("가로 사진 필름 감성"), true);
  assert.equal(hasOrientationIntent("가로로 찍은 사진"), true);
  assert.equal(hasOrientationIntent("세로로 긴 사진"), true);
  assert.equal(hasOrientationIntent("세로사진을 보여줘"), true);
  assert.equal(hasOrientationIntent("세로사진으로 보여줘"), true);
  assert.equal(hasOrientationIntent("가로형으로 찍어줘"), true);
  assert.equal(hasOrientationIntent("세로사진만"), true);
  assert.equal(hasOrientationIntent("세로형 프로필"), true);
  assert.equal(hasOrientationIntent("horizontal couple portrait"), true);
  assert.equal(hasOrientationIntent("가로수길 커플 스냅"), false);
  assert.equal(hasOrientationIntent("푸른 숲속 커플"), false);
});

test("keeps the best match first while spacing server-side album candidates", () => {
  const vector: DiversityPhoto[] = [
    { id: "best", width: 1600, height: 900, album_id: "album-a", distance: 0.1 },
    { id: "same-album", width: 1600, height: 900, album_id: "album-a", distance: 0.105 },
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `portrait-${index}`,
      width: 800,
      height: 1200,
      album_id: `portrait-album-${index}`,
      distance: 0.12 + index * 0.01,
    })),
    { id: "landscape-b", width: 1600, height: 900, album_id: "album-b", distance: 0.24 },
  ];

  const result = diversifySearchResults("푸른 숲속 커플", [], vector);

  assert.equal(result[0]?.id, "best");
  assert.equal(
    result.some((photo, index) => index > 0 && photo.album_id === result[index - 1].album_id),
    false
  );
});

test("keeps distant portraits out of the server relevance page for the infinite scheduler", () => {
  const vector: DiversityPhoto[] = [
    ...Array.from({ length: 108 }, (_, index) => ({
      id: `landscape-${index}`,
      width: 1600,
      height: 900,
      album_id: `landscape-album-${index}`,
      distance: 0.1 + index * 0.001,
    })),
    ...Array.from({ length: 36 }, (_, index) => ({
      id: `portrait-${index}`,
      width: 800,
      height: 1200,
      album_id: `portrait-album-${index}`,
      distance: 0.208 + index * 0.001,
    })),
  ];

  const result = diversifySearchResults("가을 감성", [], vector);

  assert.equal(result[0]?.id, "landscape-0");
  assert.equal(
    result.slice(0, 48).every((photo) => photo.id.startsWith("landscape-")),
    true
  );
  assert.equal(result.findIndex((photo) => photo.id.startsWith("portrait-")), 108);
  assert.equal(new Set(result.map((photo) => photo.id)).size, 144);
});

test("keeps each search album out of the previous twelve result slots when alternatives exist", () => {
  const repeatedAlbum: DiversityPhoto[] = ["a", "b", "c"].map((suffix, index) => ({
    id: `repeat-${suffix}`,
    width: 800,
    height: 1200,
    album_id: "repeat-album",
    distance: 0.1 + index * 0.001,
  }));
  const alternatives: DiversityPhoto[] = Array.from({ length: 26 }, (_, index) => ({
    id: `alternative-${index}`,
    width: 800,
    height: 1200,
    album_id: `alternative-album-${index}`,
    distance: 0.2 + index * 0.01,
  }));

  const result = diversifySearchResults(
    "세로 사진",
    [],
    [...repeatedAlbum, ...alternatives]
  );

  for (let index = 0; index < result.length; index++) {
    const recentAlbums = result
      .slice(Math.max(0, index - 12), index)
      .map((photo) => photo.album_id);
    assert.equal(
      recentAlbums.includes(result[index].album_id),
      false,
      `${result[index].id} repeated ${result[index].album_id} inside the twelve-photo window`
    );
  }
});

test("keeps lower-relevance portfolios out of the first 48 results when spacing is impossible", () => {
  const relevant: DiversityPhoto[] = ["a", "b", "c", "d"].flatMap(
    (album, albumIndex) =>
      Array.from({ length: 12 }, (_, photoIndex) => ({
        id: `${album}-${photoIndex}`,
        width: 800,
        height: 1200,
        album_id: `album-${album}`,
        distance: 0.1 + albumIndex * 0.02 + photoIndex * 0.001,
      }))
  );
  const irrelevant: DiversityPhoto = {
    id: "irrelevant",
    width: 800,
    height: 1200,
    album_id: "irrelevant-album",
    distance: 0.9,
  };

  const result = diversifySearchResults("세로 사진", [], [...relevant, irrelevant]);

  assert.equal(result.findIndex((photo) => photo.id === irrelevant.id), 48);
  assert.equal(
    result.slice(0, 48).every((photo) => photo.id !== irrelevant.id),
    true
  );
});

test("keeps pure relevance order for an orientation query in the server candidate pool", () => {
  const vector: DiversityPhoto[] = [
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `landscape-${index}`,
      width: 1600,
      height: 900,
      album_id: `landscape-album-${index}`,
      distance: 0.1 + index * 0.01,
    })),
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `portrait-${index}`,
      width: 800,
      height: 1200,
      album_id: `portrait-album-${index}`,
      distance: 0.2 + index * 0.01,
    })),
  ];

  assert.deepEqual(
    diversifySearchResults("가로 사진", [], vector).map((photo) => photo.id),
    vector.map((photo) => photo.id)
  );
});

test("uses vector photos as spacers between direct metadata matches from one album", () => {
  const metadata: DiversityPhoto[] = [
    { id: "direct-a", width: 800, height: 1200, album_id: "shared-album" },
    { id: "direct-b", width: 800, height: 1200, album_id: "shared-album" },
  ];
  const vector: DiversityPhoto[] = [
    { id: "direct-a", width: 800, height: 1200, album_id: "shared-album", distance: 0.08 },
    { id: "visual-a", width: 800, height: 1200, album_id: "other-album", distance: 0.09 },
    { id: "visual-b", width: 1600, height: 900, album_id: "third-album", distance: 0.1 },
  ];

  const result = diversifySearchResults("만삭", metadata, vector);

  assert.deepEqual(result.map((photo) => photo.id), [
    "direct-a",
    "visual-a",
    "visual-b",
    "direct-b",
  ]);
});

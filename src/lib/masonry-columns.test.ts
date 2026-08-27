import assert from "node:assert/strict";
import test from "node:test";
import { buildDiverseMasonryColumns } from "./masonry-columns.ts";

type Photo = {
  id: string;
  width: number;
  height: number;
  album_id: string | null;
};

test("avoids placing the same album in overlapping masonry columns", () => {
  const photos: Photo[] = [
    { id: "album-a-first", width: 100, height: 100, album_id: "album-a" },
    { id: "album-b", width: 100, height: 100, album_id: "album-b" },
    { id: "album-c", width: 100, height: 100, album_id: "album-c" },
    { id: "album-a-next", width: 100, height: 100, album_id: "album-a" },
  ];

  const columns = buildDiverseMasonryColumns(photos, 2);
  const firstColumnIds = columns[0].map((item) => item.id);
  const secondColumnIds = columns[1].map((item) => item.id);

  assert.deepEqual(firstColumnIds, ["album-a-first", "album-c"]);
  assert.deepEqual(secondColumnIds, ["album-b", "album-a-next"]);
});

test("keeps the first ranked photo first and returns every candidate once", () => {
  const photos: Photo[] = [
    { id: "best", width: 100, height: 100, album_id: "album-a" },
    { id: "second", width: 100, height: 200, album_id: "album-b" },
    { id: "third", width: 100, height: 100, album_id: "album-c" },
  ];

  const columns = buildDiverseMasonryColumns(photos, 2);
  const positioned = columns.flat();

  assert.equal(columns[0][0]?.id, "best");
  assert.deepEqual(
    positioned.map((item) => item.feedIndex).sort((a, b) => a - b),
    [0, 1, 2]
  );
});

test("does not leave an empty column when one album repeats", () => {
  const photos: Photo[] = [
    { id: "other", width: 100, height: 100, album_id: "album-a" },
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `repeat-${index}`,
      width: 100,
      height: 100,
      album_id: "album-b",
    })),
  ];

  const columns = buildDiverseMasonryColumns(photos, 2);
  const heights = columns.map((column) =>
    column.reduce(
      (height, item) => height + item.photo.height / item.photo.width,
      0
    )
  );

  assert.ok(Math.abs(heights[0] - heights[1]) <= 1);
});

test("uses the detail recommendation albumId field to avoid visual overlap", () => {
  const photos = [
    { id: "album-a-first", width: 100, height: 100, albumId: "album-a" },
    { id: "album-b", width: 100, height: 80, albumId: "album-b" },
    { id: "album-a-next", width: 100, height: 100, albumId: "album-a" },
  ];

  const columns = buildDiverseMasonryColumns(photos, 2);

  assert.deepEqual(columns[0].map((item) => item.id), ["album-a-first", "album-a-next"]);
  assert.deepEqual(columns[1].map((item) => item.id), ["album-b"]);
});

test("search masonry avoids stacking non-portrait cards when another column is available", () => {
  const photos: Photo[] = [
    { id: "landscape-first", width: 100, height: 65, album_id: "album-a" },
    { id: "portrait", width: 100, height: 112, album_id: "album-b" },
    { id: "landscape-next", width: 100, height: 65, album_id: "album-c" },
  ];

  const columns = buildDiverseMasonryColumns(photos, 2, {
    disperseNonPortrait: true,
  });

  assert.deepEqual(columns[0].map((item) => item.id), ["landscape-first"]);
  assert.deepEqual(columns[1].map((item) => item.id), ["portrait", "landscape-next"]);
});

test("search masonry avoids overlapping non-portrait cards across columns", () => {
  const photos: Photo[] = [
    { id: "landscape-left", width: 100, height: 80, album_id: "album-a" },
    { id: "portrait-right", width: 100, height: 120, album_id: "album-b" },
    { id: "portrait-left", width: 100, height: 120, album_id: "album-c" },
    { id: "landscape-right", width: 100, height: 100, album_id: "album-d" },
    { id: "landscape-next", width: 100, height: 60, album_id: "album-e" },
  ];

  const columns = buildDiverseMasonryColumns(photos, 2, {
    disperseNonPortrait: true,
  });

  assert.deepEqual(columns[0].map((item) => item.id), ["landscape-left", "portrait-left"]);
  assert.deepEqual(
    columns[1].map((item) => item.id),
    ["portrait-right", "landscape-right", "landscape-next"]
  );
});

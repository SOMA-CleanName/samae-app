import assert from "node:assert/strict";
import test from "node:test";
import {
  expandSearchResultLoop,
  shouldKeepGallerySentinel,
} from "./search-feed-loop.ts";

const photos = [
  { id: "best" },
  { id: "second" },
  { id: "third" },
];

test("keeps the search sentinel after the unique result pool is exhausted", () => {
  assert.equal(
    shouldKeepGallerySentinel({
      searchMode: true,
      poolSize: photos.length,
      visibleCount: photos.length,
      canLoadServer: false,
    }),
    true
  );
});

test("continues search results in deterministic cycles without changing the first ranking", () => {
  const expanded = expandSearchResultLoop(photos, 8, "가을");

  assert.equal(expanded.length, 8);
  assert.deepEqual(expanded.slice(0, 3), photos);
  assert.equal(expanded[2]?.id === expanded[3]?.id, false);
  assert.deepEqual(expanded, expandSearchResultLoop(photos, 8, "가을"));
  assert.equal(expanded.every((photo) => photos.includes(photo)), true);
});

test("does not repeat ordinary feed items", () => {
  assert.equal(
    shouldKeepGallerySentinel({
      searchMode: false,
      poolSize: photos.length,
      visibleCount: photos.length,
      canLoadServer: false,
    }),
    false
  );
});

test("keeps a 75 percent portrait share on every infinite-search page without starving candidates", () => {
  const portraitPhotos = Array.from({ length: 122 }, (_, index) => ({
    id: `portrait-${index}`,
    width: 800,
    height: 1200,
    album_id: `portrait-album-${index}`,
  }));
  const otherPhotos = Array.from({ length: 178 }, (_, index) => ({
    id: `landscape-${index}`,
    width: 1600,
    height: 900,
    album_id: `landscape-album-${index}`,
  }));
  const pool = [...portraitPhotos, ...otherPhotos];

  const expanded = expandSearchResultLoop(pool, 48 * 15, "가을 감성");

  for (let page = 0; page < 15; page++) {
    const photos = expanded.slice(page * 48, (page + 1) * 48);
    const portraitCount = photos.filter(
      (photo) => photo.width / photo.height < 0.9
    ).length;
    assert.equal(portraitCount, 36, `page ${page + 1} lost the 75 percent share`);
  }
  assert.equal(
    pool.every((photo) => expanded.some((item) => item.id === photo.id)),
    true,
    "each unique candidate must eventually appear"
  );
});

test("keeps repeated albums outside the previous twelve weighted search results when alternatives exist", () => {
  const repeatedPortraits = Array.from({ length: 6 }, (_, index) => ({
    id: `repeat-${index}`,
    width: 800,
    height: 1200,
    album_id: "repeated-album",
  }));
  const portraitAlternatives = Array.from({ length: 36 }, (_, index) => ({
    id: `portrait-alternative-${index}`,
    width: 800,
    height: 1200,
    album_id: `portrait-album-${index}`,
  }));
  const otherAlternatives = Array.from({ length: 20 }, (_, index) => ({
    id: `other-alternative-${index}`,
    width: 1600,
    height: 900,
    album_id: `other-album-${index}`,
  }));

  const expanded = expandSearchResultLoop(
    [...repeatedPortraits, ...portraitAlternatives, ...otherAlternatives],
    48,
    "가을 감성"
  );

  for (let index = 0; index < expanded.length; index++) {
    const recentAlbums = expanded
      .slice(Math.max(0, index - 12), index)
      .map((photo) => photo.album_id);
    assert.equal(
      recentAlbums.includes(expanded[index].album_id),
      false,
      `${expanded[index].album_id} repeated inside the twelve-photo window`
    );
  }
});

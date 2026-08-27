import assert from "node:assert/strict";
import test from "node:test";
import {
  homeNavMode,
  routeSessionKey,
  searchSessionStorageKeys,
  searchHref,
} from "./search-navigation.ts";

test("builds a shareable q URL from a trimmed natural-language query", () => {
  assert.equal(
    searchHref("  푸른 숲속 커플 사진  "),
    "/?q=%ED%91%B8%EB%A5%B8%20%EC%88%B2%EC%86%8D%20%EC%BB%A4%ED%94%8C%20%EC%82%AC%EC%A7%84"
  );
});

test("returns home when the search input is empty", () => {
  assert.equal(searchHref("   "), "/");
});

test("treats a non-empty q on the root route as search mode for the home tab", () => {
  assert.equal(homeNavMode("/", "  만삭 사진  "), "leave-search");
});

test("keeps the existing refresh behavior on the query-free root home", () => {
  assert.equal(homeNavMode("/", null), "refresh-home");
});

test("opens home normally from a non-home route", () => {
  assert.equal(homeNavMode("/photos/photo-id", null), "open-home");
});

test("uses a distinct canonical scroll session key for each search query", () => {
  assert.equal(routeSessionKey("/", "  필름 감성  "), "/?q=%ED%95%84%EB%A6%84%20%EA%B0%90%EC%84%B1");
  assert.equal(routeSessionKey("/", "한복"), "/?q=%ED%95%9C%EB%B3%B5");
  assert.equal(routeSessionKey("/", null), "/");
});

test("returns every query-specific session key that Home must discard", () => {
  assert.deepEqual(searchSessionStorageKeys("/", "  필름 감성  "), [
    "samae:scroll:/?q=%ED%95%84%EB%A6%84%20%EA%B0%90%EC%84%B1",
    "samae:scroll-anchor:/?q=%ED%95%84%EB%A6%84%20%EA%B0%90%EC%84%B1",
    "samae:gallery-session:search-relevance-masonry-v5:/?q=%ED%95%84%EB%A6%84%20%EA%B0%90%EC%84%B1",
  ]);
  assert.deepEqual(searchSessionStorageKeys("/", null), []);
});

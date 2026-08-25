import assert from "node:assert/strict";
import test from "node:test";
import { searchHref } from "./search-navigation.ts";

test("builds a shareable q URL from a trimmed natural-language query", () => {
  assert.equal(
    searchHref("  푸른 숲속 커플 사진  "),
    "/?q=%ED%91%B8%EB%A5%B8%20%EC%88%B2%EC%86%8D%20%EC%BB%A4%ED%94%8C%20%EC%82%AC%EC%A7%84"
  );
});

test("returns home when the search input is empty", () => {
  assert.equal(searchHref("   "), "/");
});

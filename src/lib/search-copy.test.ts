import assert from "node:assert/strict";
import test from "node:test";
import * as searchCopy from "./search-copy.ts";

test("uses common co-occurring Korean photo tags without an example prefix", () => {
  assert.deepEqual(searchCopy.SEARCH_PLACEHOLDER_EXAMPLES, [
    "개인스냅 빈티지스냅",
    "데이트 커플스냅",
    "패션 화보",
    "야외웨딩스냅 웨딩스냅",
    "빈티지 필름",
    "가을 감성",
  ]);
  assert.ok(searchCopy.SEARCH_PLACEHOLDER_EXAMPLES.every((example) => !example.startsWith("예:")));
  assert.ok(searchCopy.SEARCH_PLACEHOLDER_EXAMPLES.every((example) => /[가-힣]/.test(example)));
});

test("picks one placeholder deterministically from a random fraction", () => {
  assert.equal(searchCopy.pickSearchPlaceholder(0), "개인스냅 빈티지스냅");
  assert.equal(searchCopy.pickSearchPlaceholder(0.5), "야외웨딩스냅 웨딩스냅");
  assert.equal(searchCopy.pickSearchPlaceholder(0.999999), "가을 감성");
});

test("floats a search only after its original position reaches the top offset", () => {
  assert.equal(searchCopy.getSearchDockMode?.(24, 8), "inline");
  assert.equal(searchCopy.getSearchDockMode?.(8, 8), "floating");
  assert.equal(searchCopy.getSearchDockMode?.(-20, 8), "floating");
});

test("adds a small right inset only to the photo detail search", () => {
  assert.equal(searchCopy.getSearchDockRightInset?.("home"), 0);
  assert.equal(searchCopy.getSearchDockRightInset?.("detail"), 0);
  assert.equal(searchCopy.getSearchDockRightInset?.("photo"), 12);
});

test("reveals a floating search on hover, focus, or upward scrolling", () => {
  assert.equal(
    searchCopy.getSearchDockSurface?.("floating", {
      hovered: false,
      focused: false,
      scrollDirection: "down",
    }),
    "transparent",
  );
  assert.equal(
    searchCopy.getSearchDockSurface?.("floating", {
      hovered: true,
      focused: false,
      scrollDirection: "down",
    }),
    "filled",
  );
  assert.equal(
    searchCopy.getSearchDockSurface?.("floating", {
      hovered: false,
      focused: true,
      scrollDirection: "down",
    }),
    "filled",
  );
  assert.equal(
    searchCopy.getSearchDockSurface?.("floating", {
      hovered: false,
      focused: false,
      scrollDirection: "up",
    }),
    "filled",
  );
  assert.equal(
    searchCopy.getSearchDockSurface?.("inline", {
      hovered: false,
      focused: false,
      scrollDirection: "down",
    }),
    "filled",
  );
});

test("uses a translucent overlay only when a floating search is revealed", () => {
  assert.equal(searchCopy.getSearchPillAppearance?.("inline", "filled"), "surface");
  assert.equal(searchCopy.getSearchPillAppearance?.("floating", "transparent"), "clear");
  assert.equal(searchCopy.getSearchPillAppearance?.("floating", "filled"), "overlay");
});

test("uses an opaque active surface while the floating search has focus", () => {
  assert.equal(searchCopy.getSearchPillAppearance?.("floating", "filled", true), "active");
  assert.equal(searchCopy.getSearchPillAppearance?.("floating", "filled", false), "overlay");
});

test("replaces tag examples with a short search label only on the floating overlay", () => {
  assert.equal(searchCopy.getSearchPillPlaceholder?.("surface", "가을 감성"), "가을 감성");
  assert.equal(searchCopy.getSearchPillPlaceholder?.("clear", "가을 감성"), "가을 감성");
  assert.equal(searchCopy.getSearchPillPlaceholder?.("overlay", "가을 감성"), "검색");
  assert.equal(searchCopy.getSearchPillPlaceholder?.("active", "가을 감성"), "검색");
});

test("uses a subtle border only while the search surface is transparent", () => {
  assert.equal(searchCopy.getSearchDockBorderTone?.("transparent"), "subtle");
  assert.equal(searchCopy.getSearchDockBorderTone?.("filled"), "strong");
});

test("slightly thickens only the transparent search outline", () => {
  assert.equal(searchCopy.getSearchDockBorderWidth?.("transparent"), 1.5);
  assert.equal(searchCopy.getSearchDockBorderWidth?.("filled"), 1);
});

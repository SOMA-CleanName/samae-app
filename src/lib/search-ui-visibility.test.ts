import assert from "node:assert/strict";
import test from "node:test";
import { shouldShowSearchUi } from "./search-ui-visibility.ts";

test("hides every public search entry point while the temporary UI flag is off", () => {
  assert.equal(shouldShowSearchUi("home"), false);
  assert.equal(shouldShowSearchUi("results"), false);
  assert.equal(shouldShowSearchUi("photo"), false);
});

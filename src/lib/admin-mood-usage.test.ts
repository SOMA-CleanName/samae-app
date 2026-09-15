import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeMoodUsage } from "./admin-mood-usage";
test("deduplicates each photo across manual/auto tags and repeated rows", () => {
  const photo = { id: "one", mood_tags: [" 따뜻한  빛 ", "따뜻한 빛"], auto_mood_tags: ["따뜻한 빛", "몽환적인"] };
  const result = summarizeMoodUsage([photo, photo, { id: "two", mood_tags: [], auto_mood_tags: null }]);
  assert.equal(result.totalPhotos, 2);
  assert.equal(result.taggedPhotos, 1);
  assert.equal(result.untaggedPhotos, 1);
  assert.equal(result.usage.size, 2);
  assert.deepEqual(result.usage.get("따뜻한 빛"), { label: "따뜻한 빛", photos: 1, manual: 1, auto: 1 });
});
test("empty tags do not count and synonyms remain separate", () => {
  const result = summarizeMoodUsage([{ id: "one", mood_tags: ["", "  ", "따뜻한"], auto_mood_tags: ["포근한"] }]);
  assert.equal(result.usage.size, 2);
  assert.equal(summarizeMoodUsage([]).untaggedPhotos, 0);
});

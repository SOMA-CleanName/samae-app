import assert from "node:assert/strict";
import test from "node:test";
import { matchesDirectPhotoMetadata } from "./search-metadata-core.ts";

test("requires every original term before promoting a multi-word metadata match", () => {
  assert.equal(
    matchesDirectPhotoMetadata("만삭", ["만삭촬영과 우정스냅을 함께 진행했어요"]),
    true
  );
  assert.equal(
    matchesDirectPhotoMetadata("푸른 숲속 커플 사진", ["커플스냅", "사진 촬영"]),
    false
  );
  assert.equal(
    matchesDirectPhotoMetadata("푸른 숲속 커플", ["푸른 숲속", "커플스냅"]),
    true
  );
});

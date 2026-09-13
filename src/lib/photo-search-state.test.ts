import assert from "node:assert/strict";
import test from "node:test";
import { resolvePhotoSearch } from "./photo-search-state.ts";

test("successful empty search stays distinct from an unavailable search", async () => {
  assert.deepEqual(await resolvePhotoSearch(async () => []), { status: "ready", data: [] });
  assert.deepEqual(await resolvePhotoSearch(async () => null), { status: "unavailable" });
});

test("preserves successful search data", async () => {
  assert.deepEqual(await resolvePhotoSearch(async () => ({ photos: ["photo-1"], likedIds: [] })), {
    status: "ready", data: { photos: ["photo-1"], likedIds: [] },
  });
});

test("dependency failure becomes an unavailable state and cancels remaining work", async () => {
  let signal: AbortSignal | undefined;
  const result = await resolvePhotoSearch(async (requestSignal) => {
    signal = requestSignal;
    throw new Error("embedding HTTP 503");
  });
  assert.deepEqual(result, { status: "unavailable" });
  assert.equal(signal?.aborted, true);
});

test("a request that never settles is bounded and aborted", async () => {
  let signal: AbortSignal | undefined;
  const result = await resolvePhotoSearch((requestSignal) => {
    signal = requestSignal;
    return new Promise<never>(() => {});
  }, 15);
  assert.deepEqual(result, { status: "unavailable" });
  assert.equal(signal?.aborted, true);
});

test("late completion cannot replace a timed-out result", async () => {
  let finish!: (value: string[]) => void;
  const late = new Promise<string[]>((resolve) => { finish = resolve; });
  const result = await resolvePhotoSearch(() => late, 10);
  finish(["old-photo"]);
  await late;
  assert.deepEqual(result, { status: "unavailable" });
});

test("a new attempt can succeed after an earlier timeout", async () => {
  await resolvePhotoSearch(() => new Promise<never>(() => {}), 10);
  const result = await resolvePhotoSearch(async () => ["new-photo"]);
  assert.deepEqual(result, { status: "ready", data: ["new-photo"] });
});

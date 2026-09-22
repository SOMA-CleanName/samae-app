// 마케팅 사용 가능 판정 — 여기서 틀리면 동의 없는 사진이 광고로 나간다.
//   npx tsx --test src/lib/marketing-photos.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isMarketingUsable,
  blockedReason,
  filterMarketingPhotos,
  tallyByPhotographer,
  topMoods,
  EMPTY_FILTER,
  type MarketingPhoto,
} from "./marketing-photos.ts";

const photo = (o: Partial<MarketingPhoto> = {}): MarketingPhoto => ({
  id: "p1",
  thumbUrl: null,
  srcUrl: "https://x/1.jpg",
  photographerId: "ph1",
  photographerName: "모글",
  albumId: "a1",
  albumTitle: "월드인",
  albumAdConsent: true,
  visibility: "published",
  feedHidden: false,
  purpose: "personal",
  moodTags: ["감성"],
  autoMoodTags: ["밤", "도시적인"],
  ...o,
});

test("동의가 있고 공개된 사진만 쓸 수 있다", () => {
  assert.equal(isMarketingUsable(photo()), true);
  assert.equal(isMarketingUsable(photo({ albumAdConsent: false })), false);
  assert.equal(isMarketingUsable(photo({ visibility: "draft" })), false);
});

test("못 쓰는 이유를 한 줄로 알려준다 — 운영이 작가에게 뭘 요청할지 알아야 한다", () => {
  assert.equal(blockedReason(photo()), null);
  assert.match(blockedReason(photo({ albumAdConsent: false }))!, /동의/);
  assert.match(blockedReason(photo({ visibility: "draft" }))!, /비공개/);
});

test("내린 사진(feed_hidden)은 판정에 안 넣는다 — 동의와 별개 사안이다", () => {
  assert.equal(isMarketingUsable(photo({ feedHidden: true })), true);
});

test("동의 필터", () => {
  const list = [photo({ id: "a" }), photo({ id: "b", albumAdConsent: false })];
  const usable = filterMarketingPhotos(list, { ...EMPTY_FILTER, consent: "usable" });
  assert.deepEqual(usable.map((p) => p.id), ["a"]);
  const blocked = filterMarketingPhotos(list, { ...EMPTY_FILTER, consent: "blocked" });
  assert.deepEqual(blocked.map((p) => p.id), ["b"]);
});

test("조건이 여럿이면 전부 만족해야 한다 — 작가 AND 용도", () => {
  const list = [
    photo({ id: "a", photographerId: "ph1", purpose: "couple" }),
    photo({ id: "b", photographerId: "ph2", purpose: "couple" }),
    photo({ id: "c", photographerId: "ph1", purpose: "wedding" }),
  ];
  const out = filterMarketingPhotos(list, {
    ...EMPTY_FILTER,
    photographerId: "ph1",
    purposes: ["couple"],
  });
  assert.deepEqual(out.map((p) => p.id), ["a"]);
});

test("같은 종류를 여럿 고르면 그중 하나만 맞아도 통과한다", () => {
  const list = [
    photo({ id: "a", purpose: "couple" }),
    photo({ id: "b", purpose: "wedding" }),
    photo({ id: "c", purpose: "event" }),
  ];
  const out = filterMarketingPhotos(list, { ...EMPTY_FILTER, purposes: ["couple", "wedding"] });
  assert.deepEqual(out.map((p) => p.id), ["a", "b"]);
});

test("무드는 자동 무드로 거른다", () => {
  const list = [photo({ id: "a", autoMoodTags: ["밤"] }), photo({ id: "b", autoMoodTags: ["낮"] })];
  const out = filterMarketingPhotos(list, { ...EMPTY_FILTER, moods: ["밤"] });
  assert.deepEqual(out.map((p) => p.id), ["a"]);
});

test("검색어는 앨범 제목·작가·무드를 함께 본다", () => {
  const list = [
    photo({ id: "a", albumTitle: "제주 스냅" }),
    photo({ id: "b", albumTitle: "성수 스튜디오", moodTags: ["제주바다"] }),
    photo({ id: "c", albumTitle: "홍대" }),
  ];
  const out = filterMarketingPhotos(list, { ...EMPTY_FILTER, query: "제주" });
  assert.deepEqual(out.map((p) => p.id).sort(), ["a", "b"]);
});

test("내린 사진 빼기", () => {
  const list = [photo({ id: "a" }), photo({ id: "b", feedHidden: true })];
  const out = filterMarketingPhotos(list, { ...EMPTY_FILTER, includeHidden: false });
  assert.deepEqual(out.map((p) => p.id), ["a"]);
});

test("작가별 집계는 못 쓰는 사진이 많은 쪽을 위로 — 할 일이 남은 쪽이다", () => {
  const list = [
    photo({ id: "1", photographerId: "ph1", photographerName: "A" }),
    photo({ id: "2", photographerId: "ph2", photographerName: "B", albumAdConsent: false }),
    photo({ id: "3", photographerId: "ph2", photographerName: "B", albumAdConsent: false }),
  ];
  const t = tallyByPhotographer(list);
  assert.equal(t[0].name, "B");
  assert.deepEqual([t[0].usable, t[0].blocked], [0, 2]);
  assert.deepEqual([t[1].usable, t[1].blocked], [1, 0]);
});

test("무드 칩은 많이 쓰인 순으로 추린다", () => {
  const list = [
    photo({ autoMoodTags: ["밤", "도시적인"] }),
    photo({ autoMoodTags: ["밤"] }),
    photo({ autoMoodTags: ["자연 속"] }),
  ];
  assert.deepEqual(topMoods(list, 2), ["밤", "도시적인"]);
});

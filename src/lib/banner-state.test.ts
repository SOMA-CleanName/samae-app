import { test } from "node:test";
import assert from "node:assert/strict";
import { bannerStatus, isBannerLive, bannerSummary, type BannerWindow } from "./banner-state";

const NOW = new Date("2026-09-19T00:00:00Z");
const b = (o: Partial<BannerWindow> = {}): BannerWindow => ({
  published: true,
  starts_at: null,
  ends_at: null,
  ...o,
});

test("기간을 안 정하면 공개된 순간부터 뜬다", () => {
  assert.equal(bannerStatus(b(), NOW).state, "live");
  assert.equal(isBannerLive(b(), NOW), true);
});

test("기간이 끝났으면 「기간 끝남」 — 회색이 아니라 경고다", () => {
  // 실제로 이 상태가 3주간 방치됐다(2026-09-19 신고)
  const s = bannerStatus(b({ ends_at: "2026-08-29T04:24:00Z" }), NOW);
  assert.equal(s.state, "expired");
  assert.equal(s.tone, "warning");
  assert.equal(s.live, false);
});

test("시작 전이면 「노출 예정」 — 끝난 것과 갈라야 한다", () => {
  const s = bannerStatus(b({ starts_at: "2026-10-01T00:00:00Z" }), NOW);
  assert.equal(s.state, "scheduled");
  assert.equal(s.live, false);
});

test("비공개가 기간보다 먼저 판정된다", () => {
  // 꺼 둔 배너를 「만료」라고 하면 운영자가 날짜를 고치러 간다 — 고쳐도 안 뜬다
  const s = bannerStatus(b({ published: false, ends_at: "2026-08-01T00:00:00Z" }), NOW);
  assert.equal(s.state, "hidden");
  assert.equal(s.label, "비공개");
});

test("종료 시각 정각은 이미 끝난 것으로 본다", () => {
  // 공개 쿼리가 ends_at > now 라 경계를 같게 맞춰야 한다(lib/banners)
  assert.equal(bannerStatus(b({ ends_at: NOW.toISOString() }), NOW).state, "expired");
});

test("시작 시각 정각은 이미 시작된 것으로 본다", () => {
  assert.equal(bannerStatus(b({ starts_at: NOW.toISOString() }), NOW).state, "live");
});

test("날짜가 깨져 있으면 조용히 노출 중이 되지 않게 무시한다", () => {
  // NaN 비교는 전부 false 라 아무 가드 없이 두면 "노출 중" 으로 샌다
  assert.equal(bannerStatus(b({ ends_at: "쓰레기" }), NOW).state, "live");
  assert.equal(bannerStatus(b({ starts_at: "" }), NOW).state, "live");
});

test("요약 — 0장이면 이유를 말한다", () => {
  const msg = bannerSummary(
    [b({ ends_at: "2026-08-29T04:24:00Z" }), b({ ends_at: "2026-08-29T04:34:00Z" })],
    NOW
  );
  assert.match(msg, /뜨는 배너가 없어요/);
  assert.match(msg, /2장은 노출 기간이 끝났어요/);
  assert.match(msg, /아티클 커버가 대신/);
});

test("요약 — 이유가 섞이면 전부 센다", () => {
  const msg = bannerSummary(
    [
      b({ ends_at: "2026-08-01T00:00:00Z" }),
      b({ starts_at: "2026-12-01T00:00:00Z" }),
      b({ published: false }),
    ],
    NOW
  );
  assert.match(msg, /1장은 노출 기간이 끝났어요/);
  assert.match(msg, /1장은 아직 시작 전이에요/);
  assert.match(msg, /1장은 비공개예요/);
});

test("요약 — 뜨고 있으면 몇 장인지만", () => {
  assert.match(bannerSummary([b(), b()], NOW), /2장이 홈에 떠요/);
  assert.match(bannerSummary([b()], NOW), /1장이 홈에 떠요/);
});

test("요약 — 하나도 없으면 아티클이 대신한다고 알린다", () => {
  assert.match(bannerSummary([], NOW), /등록한 배너가 없어요/);
});

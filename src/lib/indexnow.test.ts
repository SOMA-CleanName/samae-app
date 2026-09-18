import { test } from "node:test";
import assert from "node:assert/strict";
import { recentUrlsFromSitemap } from "./indexnow-window";

const NOW = new Date("2026-09-18T12:00:00Z");

function xml(...entries: Array<{ loc: string; mod?: string }>) {
  const body = entries
    .map((e) => `<url><loc>${e.loc}</loc>${e.mod ? `<lastmod>${e.mod}</lastmod>` : ""}</url>`)
    .join("");
  return `<?xml version="1.0"?><urlset>${body}</urlset>`;
}

test("최근에 바뀐 것만 보낸다", () => {
  const got = recentUrlsFromSitemap(
    xml(
      { loc: "https://x/a", mod: "2026-09-18T09:00:00Z" }, // 3시간 전
      { loc: "https://x/b", mod: "2026-08-01T00:00:00Z" } // 한 달 전
    ),
    NOW
  );
  assert.deepEqual(got, ["https://x/a"]);
});

test("lastmod 가 없으면 보내지 않는다 — 바뀐 줄 알 수 없다", () => {
  // 정적 지면이 여기 해당한다. 매일 보내면 그냥 소음이다.
  assert.deepEqual(recentUrlsFromSitemap(xml({ loc: "https://x/terms" }), NOW), []);
});

test("창 경계 — 25시간을 갓 넘기면 빠진다", () => {
  const inside = recentUrlsFromSitemap(xml({ loc: "https://x/a", mod: "2026-09-17T12:00:00Z" }), NOW);
  const outside = recentUrlsFromSitemap(xml({ loc: "https://x/a", mod: "2026-09-17T10:00:00Z" }), NOW);
  assert.deepEqual(inside, ["https://x/a"]); // 24시간 전
  assert.deepEqual(outside, []); // 26시간 전
});

test("깨진 lastmod 는 던지지 않고 건너뛴다", () => {
  assert.doesNotThrow(() => recentUrlsFromSitemap(xml({ loc: "https://x/a", mod: "어제" }), NOW));
  assert.deepEqual(recentUrlsFromSitemap(xml({ loc: "https://x/a", mod: "어제" }), NOW), []);
});

test("빈 sitemap 도 빈 배열", () => {
  assert.deepEqual(recentUrlsFromSitemap("<urlset></urlset>", NOW), []);
});

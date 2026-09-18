import { test } from "node:test";
import assert from "node:assert/strict";
import { GROUPS, matchTab } from "./admin-nav";

const allTabs = GROUPS.flatMap((g) => g.tabs);

test("대시보드는 정확히 일치할 때만 켜진다", () => {
  assert.equal(matchTab("/admin")?.tab.label, "대시보드");
  // exact 가 없으면 /admin 이 모든 하위 경로를 물어 항상 대시보드가 켜진다
  assert.notEqual(matchTab("/admin/users")?.tab.label, "대시보드");
});

test("하위 경로는 그 페이지로 잡힌다", () => {
  assert.equal(matchTab("/admin/photographers/abc-123")?.tab.label, "작가");
  assert.equal(matchTab("/admin/articles/42")?.tab.label, "아티클");
  assert.equal(matchTab("/admin/chats/xyz")?.tab.label, "채팅");
});

test("형제 경로를 잘못 물지 않는다", () => {
  // 경계에 / 를 안 붙이면 startsWith 가 여기서 엉킨다
  assert.equal(matchTab("/admin/photos")?.tab.label, "사진 노출");
  assert.equal(matchTab("/admin/photo-purpose")?.tab.label, "사진 목적&무드");
  assert.equal(matchTab("/admin/photo-purpose/mood/axes")?.tab.label, "사진 목적&무드");
});

test("분석 하위의 작가 상세는 「작가」가 아니라 「분석」이다", () => {
  const m = matchTab("/admin/analytics/photographers/abc");
  assert.equal(m?.tab.label, "분석");
  assert.equal(m?.group.label, "도구");
});

test("탭마다 어느 그룹인지 답한다", () => {
  assert.equal(matchTab("/admin/transactions")?.group.label, "운영");
  assert.equal(matchTab("/admin/users")?.group.label, "사람");
  assert.equal(matchTab("/admin/spots")?.group.label, "지면");
  assert.equal(matchTab("/admin/trash")?.group.label, "도구");
});

test("등록되지 않은 주소는 null — 화면은 첫 그룹으로 떨어진다", () => {
  assert.equal(matchTab("/admin/아직없는페이지"), null);
  assert.equal(matchTab("/"), null);
});

test("합쳐서 사라진 /admin/studios 는 등록부에 없다", () => {
  assert.equal(matchTab("/admin/studios"), null);
  assert.equal(
    allTabs.find((t) => t.href.startsWith("/admin/studios")),
    undefined
  );
});

test("href 가 겹치지 않는다", () => {
  const hrefs = allTabs.map((t) => t.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
});

test("그룹 key 와 라벨이 겹치지 않는다", () => {
  assert.equal(new Set(GROUPS.map((g) => g.key)).size, GROUPS.length);
  assert.equal(new Set(GROUPS.map((g) => g.label)).size, GROUPS.length);
});

test("모든 그룹에 페이지가 하나는 있다 — 그룹 탭이 빈 곳으로 보낸다", () => {
  for (const g of GROUPS) assert.ok(g.tabs.length > 0, `${g.label} 그룹이 비었다`);
});

test("모든 href 가 /admin 아래다", () => {
  for (const t of allTabs) assert.ok(t.href === "/admin" || t.href.startsWith("/admin/"), t.href);
});

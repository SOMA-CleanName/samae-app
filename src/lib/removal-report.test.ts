import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRemovalReport, type RemovalFacts } from "./removal-report";

/** 아무것도 안 걸린 상태 — 여기서 하나씩 켜 가며 본다 */
const CLEAN: RemovalFacts = {
  bookings: 0,
  platformFees: 0,
  settlements: 0,
  openConversations: 0,
  openInquiries: 0,
  articles: [],
  banners: [],
  highlightCovers: 0,
  spotsGoingDark: [],
  storageFiles: 0,
  cascadeRows: 0,
  marketingLedger: { available: true, active: 0 },
};
const at = (f: Partial<RemovalFacts>) => buildRemovalReport({ ...CLEAN, ...f });
const keys = (f: Partial<RemovalFacts>) => at(f).blockers.map((b) => b.key);

test("걸린 게 없으면 퇴출할 수 있다", () => {
  const r = at({});
  assert.equal(r.canRemove, true);
  assert.deepEqual(r.blockers, []);
});

test("돈이 걸린 건 막는다", () => {
  // FK RESTRICT 라 DB 도 거부하지만, 거기서 나오는 건 FK 위반 메시지뿐이라
  // 운영자가 뭘 해야 할지 모른다. 사람 말로 먼저 막는다.
  assert.deepEqual(keys({ bookings: 2 }), ["bookings"]);
  assert.deepEqual(keys({ platformFees: 1 }), ["platform_fees"]);
  assert.deepEqual(keys({ settlements: 1 }), ["settlements"]);
  assert.equal(at({ bookings: 1 }).canRemove, false);
});

test("열려 있는 대화를 막는다 — FK 는 이걸 안 막는다", () => {
  /*
    conversations 는 CASCADE 다. DB 는 아무 불평 없이 지운다.
    고객이 답을 기다리는 방이 예고 없이 사라지는 일이라 여기서 세운다.
  */
  assert.deepEqual(keys({ openConversations: 3 }), ["conversations"]);
  assert.deepEqual(keys({ openInquiries: 1 }), ["inquiries"]);
});

test("아티클·배너가 쓰는 사진을 막는다 — 여기도 FK 가 없다", () => {
  /*
    cover_url·image_url 은 **URL 문자열 복사**다. 작가를 지워도 아무 일이 안 일어나고,
    파일까지 지우는 순간 깨진 이미지가 된다. 그 사이에 아무 신호가 없어서 위험하다.
  */
  const r = at({
    articles: [{ title: "성수에서 찍기 좋은 골목", published: true }],
    banners: [{ title: "가을 프로모션", published: false }],
  });
  assert.deepEqual(r.blockers.map((b) => b.key), ["articles", "banners"]);
  assert.equal(r.canRemove, false);
  // 목록으로 보여줘야 운영자가 어느 걸 고칠지 안다
  assert.deepEqual(r.items.find((i) => i.key === "articles")?.detail, [
    "공개 · 성수에서 찍기 좋은 골목",
  ]);
  assert.deepEqual(r.items.find((i) => i.key === "banners")?.detail, ["비공개 · 가을 프로모션"]);
});

test("비공개 아티클도 막는다", () => {
  // 지금 안 보인다고 괜찮은 게 아니다 — 나중에 공개하면 그때 깨진 이미지가 뜬다
  assert.deepEqual(keys({ articles: [{ title: "초안", published: false }] }), ["articles"]);
});

test("마케팅 대장이 없으면 '확인 불가'로 남는다 — 0 으로 적지 않는다", () => {
  /*
    ⚠️ 여기가 이 함수에서 제일 틀리기 쉬운 자리다.
       대장이 없을 때 active=0 으로 두면 화면에 "집행 중 소재 없음" 으로 보이고,
       운영자는 확인했다고 믿는다. **모르는 것과 없는 것은 다르다.**
  */
  const r = at({ marketingLedger: { available: false } });
  const m = r.items.find((i) => i.key === "marketing");
  assert.equal(m?.level, "unknown");
  assert.match(m?.label ?? "", /확인할 수 없/);
  // 막지는 않는다 — 대장이 생길 때까지 아무도 퇴출 못 하는 건 과하다
  assert.equal(r.canRemove, true);
  assert.equal(r.blockers.length, 0);
});

test("대장이 있고 집행 중이면 막는다", () => {
  assert.deepEqual(keys({ marketingLedger: { available: true, active: 2 } }), ["marketing"]);
});

test("대장이 있고 0건이면 그 줄은 아예 안 뜬다", () => {
  // 걸린 게 없는 항목까지 늘어놓으면 진짜 막는 게 안 보인다
  assert.equal(at({}).items.some((i) => i.key === "marketing"), false);
});

test("자동 처리 항목은 막지 않는다", () => {
  const r = at({
    spotsGoingDark: [{ slug: "gyeongbokgung", before: 12, after: 8 }],
    storageFiles: 154,
    highlightCovers: 2,
    cascadeRows: 97,
  });
  assert.equal(r.canRemove, true, "자동 처리되는 것이 퇴출을 막으면 안 된다");
  assert.deepEqual(
    r.items.filter((i) => i.level === "auto").map((i) => i.key),
    ["highlights", "spots", "storage"]
  );
  assert.deepEqual(r.items.find((i) => i.key === "spots")?.detail, [
    "gyeongbokgung · 12 → 8장",
  ]);
});

test("0건인 항목은 화면에 안 올린다", () => {
  // 히히픽 실측값 — 아티클 0·배너 0·스팟 무변동. 이때 뜨는 건 CASCADE 숫자뿐이다
  const r = at({ cascadeRows: 97, storageFiles: 154 });
  assert.deepEqual(r.items.map((i) => i.key), ["storage", "cascade"]);
  assert.equal(r.canRemove, true);
});

test("여러 개가 동시에 걸리면 전부 보여준다", () => {
  // 하나 고치고 눌렀다가 또 막히는 걸 반복하게 하면 안 된다
  const r = at({
    bookings: 1,
    openConversations: 2,
    articles: [{ title: "A", published: true }],
  });
  assert.deepEqual(r.blockers.map((b) => b.key), ["bookings", "conversations", "articles"]);
});

test("막는 항목에는 무엇을 해야 하는지가 붙는다", () => {
  const r = at({ bookings: 1, openConversations: 1, articles: [{ title: "A", published: true }] });
  for (const b of r.blockers) assert.ok(b.howTo, `${b.key} 에 howTo 가 없다`);
});

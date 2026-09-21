// 안내 이미지 묶음 — 카드가 조용히 사라지지 않는지만 본다.
// 렌더(next/og)는 무거워서 제외하고, 순수 로직인 groupCardsIntoSheets 만 검증한다.
//   npx tsx --test src/lib/guide-card-template.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { groupCardsIntoSheets, GUIDE_SHEETS, MAX_CARDS_PER_CARD, FONT_SETS } from "./guide-card-template.tsx";
import { FONTS } from "./guide-style.ts";

const card = (topic: string, i: number) => ({ topic, id: `${topic}-${i}`, body: "본문" });

test("모든 카드가 어느 장에든 들어간다 — 유실 0", () => {
  const cards = [
    ...Array.from({ length: 3 }, (_, i) => card("가격", i)),
    ...Array.from({ length: 2 }, (_, i) => card("보정", i)),
    card("듣도보도못한주제", 0),
  ];
  const total = groupCardsIntoSheets(cards).reduce((n, s) => n + s.cards.length, 0);
  assert.equal(total, cards.length);
});

test("목록에 없는 주제는 '그 외 안내' 로 모인다", () => {
  const sheets = groupCardsIntoSheets([card("가격", 0), card("신규주제", 0)]);
  const rest = sheets.find((s) => s.label === "그 외 안내");
  assert.ok(rest, "그 외 장이 없다");
  assert.equal(rest.cards.length, 1);
  assert.equal(rest.cards[0].topic, "신규주제");
});

test("상한을 넘으면 잘라내지 않고 장을 쪼갠다 — 분량이 고르게", () => {
  const n = MAX_CARDS_PER_CARD + 1;
  const sheets = groupCardsIntoSheets(Array.from({ length: n }, (_, i) => card("가격", i)));
  assert.equal(sheets.length, 2, "쪼개지지 않았다");
  // 앞을 꽉 채우고 뒤에 한 장만 남기면(옛 규칙) 세트를 같은 크기로 맞출 때
  // 뒷장이 통째로 빈칸이 된다. 반반으로 나눈다.
  const counts = sheets.map((s) => s.cards.length);
  assert.ok(Math.abs(counts[0] - counts[1]) <= 1, `분량이 안 고르다: ${counts.join("/")}`);
  assert.ok(sheets[0].label.includes("(1/2)"), `라벨에 순번이 없다: ${sheets[0].label}`);
  assert.equal(sheets.reduce((t, s) => t + s.cards.length, 0), n);
});

test("카드 수가 적어도 분량이 많으면 쪼갠다 — 긴 카드 넷이 짧은 카드 여덟보다 길다", () => {
  const long = (i: number) => ({ ...card("가격", i), body: "가".repeat(400) });
  const sheets = groupCardsIntoSheets(Array.from({ length: 4 }, (_, i) => long(i)));
  assert.ok(sheets.length > 1, "분량이 넘치는데 한 장에 뒀다");
  assert.equal(sheets.reduce((t, s) => t + s.cards.length, 0), 4);
});

test("빈 장은 절대 나오지 않는다 — 카드 0장짜리 안내 이미지가 발행돼 버린다", () => {
  // 한 장이 유난히 길면 상한 계산상 두 묶음이 필요한데, 카드가 그만큼 없을 수 있다
  for (const n of [1, 2, 3, 5, 9, 17]) {
    const cards = Array.from({ length: n }, (_, i) => ({
      ...card("가격", i),
      body: "가".repeat(i === 0 ? 590 : 30),
    }));
    for (const s of groupCardsIntoSheets(cards)) {
      assert.ok(s.cards.length > 0, `카드 ${n}장에서 빈 장이 나왔다: ${s.label}`);
    }
  }
});

test("쪼갠 뒤 번호는 실제 장수와 맞는다", () => {
  const cards = Array.from({ length: MAX_CARDS_PER_CARD + 3 }, (_, i) => card("가격", i));
  const sheets = groupCardsIntoSheets(cards).filter((s) => s.label.includes("("));
  for (const s of sheets) {
    const m = s.label.match(/\((\d+)\/(\d+)\)/);
    assert.ok(m, `번호가 없다: ${s.label}`);
    assert.equal(Number(m![2]), sheets.length, `분모가 실제 장수와 다르다: ${s.label}`);
  }
});

test("카드가 없는 장은 만들지 않는다", () => {
  const sheets = groupCardsIntoSheets([card("가격", 0)]);
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].label, "가격·구성");
});

test("한 주제가 두 장에 중복으로 잡히지 않는다", () => {
  const seen = new Set<string>();
  for (const sheet of GUIDE_SHEETS) {
    for (const t of sheet.topics) {
      assert.ok(!seen.has(t), `"${t}" 가 여러 장에 들어 있다`);
      seen.add(t);
    }
  }
});

// 고를 수 있는데 파일이 없는 글씨체가 있으면, 고른 순간 이미지가 기본 폰트로
// 조용히 되돌아간다 — 왜 안 바뀌냐는 문의로 돌아온다.
test("고를 수 있는 글씨체는 전부 실제 파일 묶음이 있다", () => {
  for (const f of FONTS) {
    const set = FONT_SETS[f.key];
    assert.ok(set, `${f.key}: FONT_SETS 에 없다`);
    for (const path of [...set.sans, ...set.serif, set.latin]) {
      assert.match(path, /^[a-z0-9-]+@latest\/[a-z0-9-]+-\d{3}-normal\.woff$/, `${f.key}: 경로가 이상하다 — ${path}`);
    }
  }
});

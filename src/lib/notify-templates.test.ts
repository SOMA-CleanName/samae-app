import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOTIFY_KINDS,
  NOTIFY_TEMPLATES,
  alimtalkTemplateEnvKey,
  formatKrwVar,
  formatShootDateVar,
  nameVar,
  renderNotifyBody,
  toSolapiVariables,
} from "./notify-templates";

const fill = (vars: readonly string[]) =>
  Object.fromEntries(vars.map((v) => [v, `<${v}>`]));

test("템플릿 본문에 선언된 변수가 전부 등장하고, 선언 안 된 변수는 없다", () => {
  for (const kind of NOTIFY_KINDS) {
    const t = NOTIFY_TEMPLATES[kind];
    const inBody = new Set([...t.body.matchAll(/#\{([^}]+)\}/g)].map((m) => m[1]));
    assert.deepEqual([...inBody].sort(), [...t.variables].sort(), `${kind} 변수 불일치`);
    // 버튼 링크 변수도 본문에 있어야 문자 대체 시 링크가 살아남는다
    assert.ok(inBody.has(t.button.urlVariable), `${kind} 버튼 변수가 본문에 없음`);
    assert.ok(t.body.startsWith("[사매]"), `${kind} 본문은 [사매] 로 시작`);
  }
});

test("렌더링하면 #{} 가 하나도 남지 않는다", () => {
  for (const kind of NOTIFY_KINDS) {
    const body = renderNotifyBody(kind, fill(NOTIFY_TEMPLATES[kind].variables));
    assert.ok(!/#\{/.test(body), `${kind} 렌더 후 잔여 변수`);
  }
});

test("변수가 비면 던진다 — 빈 문자열도 누락", () => {
  assert.throws(() => renderNotifyBody("chat_reply", { 작가명: "모글" }), /링크/);
  assert.throws(() => renderNotifyBody("chat_reply", { 작가명: "  ", 링크: "https://x" }), /작가명/);
});

test("solapi 변수 키는 #{이름} 꼴", () => {
  assert.deepEqual(toSolapiVariables({ 작가명: "모글", 링크: "https://samae.ai/chat/1" }), {
    "#{작가명}": "모글",
    "#{링크}": "https://samae.ai/chat/1",
  });
});

test("env 키는 kind 대문자", () => {
  assert.equal(alimtalkTemplateEnvKey("deposit_confirmed"), "ALIMTALK_TPL_DEPOSIT_CONFIRMED");
});

test("금액은 천단위 콤마, 음수·null 은 0", () => {
  assert.equal(formatKrwVar(150000), "150,000");
  assert.equal(formatKrwVar(null), "0");
  assert.equal(formatKrwVar(-5), "0");
});

test("촬영일은 KST 로, 시각 없으면 날짜만, 둘 다 없으면 협의 중", () => {
  // 2026-09-12 05:00 UTC = 14:00 KST (토)
  assert.equal(formatShootDateVar("2026-09-12T05:00:00Z"), "9월 12일 (토) 오후 2시");
  assert.equal(formatShootDateVar("2026-09-12T05:30:00Z"), "9월 12일 (토) 오후 2:30");
  assert.equal(formatShootDateVar(null, "2026-09-12"), "9월 12일 (토)");
  assert.equal(formatShootDateVar(null, null), "협의 중");
  assert.equal(formatShootDateVar("not-a-date", "bad"), "협의 중");
});

test("이름이 비면 역할명", () => {
  assert.equal(nameVar(" 모글 ", "작가"), "모글");
  assert.equal(nameVar(null, "작가"), "작가");
  assert.equal(nameVar("", "고객"), "고객");
});

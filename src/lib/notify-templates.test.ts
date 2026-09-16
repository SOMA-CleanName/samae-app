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
    // 본문에 #{링크} 가 살아 있어야 한다 — 문자로 대체 발송되면 버튼이 없다
    assert.ok(inBody.has("링크"), `${kind} 본문에 #{링크} 가 없음`);
    assert.ok(t.body.startsWith("[사매]"), `${kind} 본문은 [사매] 로 시작`);
  }
});

test("버튼 URL 은 프로토콜·도메인이 고정이고 경로만 변수다", () => {
  // 카카오는 웹링크에 프로토콜이 앞에 고정으로 있기를 요구한다.
  // `#{링크}` 처럼 변수 하나만 넣으면 콘솔이 등록을 거부한다(2026-09-08 확인).
  for (const kind of NOTIFY_KINDS) {
    const b = NOTIFY_TEMPLATES[kind].button;
    assert.ok(b.url.startsWith("https://samae.ai/"), `${kind} 버튼 URL 이 고정 도메인으로 시작해야 함`);
    const inUrl = [...b.url.matchAll(/#\{([^}]+)\}/g)].map((m) => m[1]);
    if (b.urlVariable) {
      assert.deepEqual(inUrl, [b.urlVariable], `${kind} 버튼 URL 변수 불일치`);
    } else {
      assert.deepEqual(inUrl, [], `${kind} 는 고정 URL 이라 변수가 없어야 함`);
    }
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

// ── 카카오 심사에서 배운 것 (2026-09-11 반려 2건) ──────────────────
//
// 아래 두 규칙은 **디자인 취향이 아니라 승인 조건**이다. 어기면 재심사에서 떨어지고
// 그동안 해당 알림이 통째로 안 나간다. 문구를 다듬다가 조용히 지우기 쉬워서 고정한다.

test("메시지마다 나가는 알림은 발송 조건을 고정값으로 밝힌다 — 다발성 반려 방지", () => {
  // 사유: "새로운 채팅이 도착할 때마다 발송되는 다발성 메시지인 경우, 수신자가
  //        동의·요청하여 발송된다는 내용을 메시지 내 고정값으로 추가 기재"
  const body = NOTIFY_TEMPLATES.chat_message_to_photographer.body;
  assert.ok(
    body.includes("해당 메시지는") && body.includes("발송됩니다"),
    "다발성 알림 고지 문구가 사라졌다 — 이대로 재심사를 넣으면 반려된다"
  );
});

test("예약 제안은 방향별로 갈리고, 각자 수신자의 행위를 첫 줄에 박는다", () => {
  // 사유: "수신 대상을 명확하게 확인하기 어렵다. 수신자의 어떠한 액션으로 발송되는지"
  //        → 양방향 한 종으로는 답이 안 나와 두 번 반려됐다.
  const toPh = NOTIFY_TEMPLATES.booking_proposed_to_photographer;
  const toCu = NOTIFY_TEMPLATES.booking_proposed_to_customer;

  // 수신자가 한 행위로 시작 (승인된 6종의 공통 패턴)
  assert.ok(toPh.body.startsWith("[사매] 등록하신 스튜디오에"), toPh.body.slice(0, 30));
  assert.ok(toCu.body.startsWith("[사매] 문의하신 촬영 건에"), toCu.body.slice(0, 30));

  // 발송 조건 고정값
  for (const t of [toPh, toCu]) {
    assert.ok(t.body.includes("발송됩니다"), `${t.kind}: 발송 조건 고정값이 없다`);
  }

  // 수신자를 특정하는 변수여야 한다 — "상대명" 으로 뭉뚱그리면 반려 사유로 되돌아간다
  assert.ok(toPh.variables.includes("고객명"), "작가용은 고객명을 써야 한다");
  assert.ok(toCu.variables.includes("작가명"), "고객용은 작가명을 써야 한다");
  for (const t of [toPh, toCu]) {
    assert.ok(!t.variables.includes("상대명"), `${t.kind}: 상대명은 수신 대상을 흐린다`);
  }
});

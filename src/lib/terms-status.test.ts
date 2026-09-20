import { test } from "node:test";
import assert from "node:assert/strict";
import { termsStatus } from "./terms-status";
import { TERMS_VERSION } from "./policy-version";

test("현재 버전에 동의했으면 최신", () => {
  const s = termsStatus({ terms_agreed_at: "2026-09-19T00:00:00Z", terms_version: TERMS_VERSION });
  assert.equal(s.state, "current");
  assert.equal(s.label, "최신");
});

test("옛 버전에 동의했으면 구버전", () => {
  const s = termsStatus({ terms_agreed_at: "2026-08-01T00:00:00Z", terms_version: "0.9" });
  assert.equal(s.state, "outdated");
  assert.equal(s.tone, "warning");
});

test("동의 기록이 없으면 미동의", () => {
  assert.equal(termsStatus(null).state, "none");
  assert.equal(termsStatus(undefined).state, "none");
  assert.equal(termsStatus({}).state, "none");
  assert.equal(termsStatus({ terms_agreed_at: null }).state, "none");
});

test("버전만 맞고 시각이 없으면 미동의다", () => {
  // "언제 동의했는가" 에 답할 수 없는 동의는 다툼에서 못 쓴다
  assert.equal(termsStatus({ terms_agreed_at: null, terms_version: TERMS_VERSION }).state, "none");
});

test("버전이 비어 있는 옛 기록은 구버전 — 미동의가 아니다", () => {
  // 동의는 했으니 none 이 아니고, 지금 버전과 같다고 말할 근거도 없다
  const s = termsStatus({ terms_agreed_at: "2026-07-01T00:00:00Z", terms_version: null });
  assert.equal(s.state, "outdated");
});

test("작가 쪽 배지와 같은 말을 쓴다", () => {
  // 두 목록이 다른 말을 쓰면 운영자가 헷갈린다 (lib/agreement-status 와 동일)
  assert.equal(termsStatus({ terms_agreed_at: "x", terms_version: TERMS_VERSION }).label, "최신");
  assert.equal(termsStatus({ terms_agreed_at: "x", terms_version: "0.1" }).label, "구버전");
  assert.equal(termsStatus({}).label, "미동의");
});

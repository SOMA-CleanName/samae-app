import { test } from "node:test";
import assert from "node:assert/strict";
import { agreementStatus, groupAgreementsByPhotographer } from "./agreement-status";
import { PHOTOGRAPHER_AGREEMENT_VERSIONS } from "./policy-version";

const CURRENT = { ...PHOTOGRAPHER_AGREEMENT_VERSIONS };
const OLD = { terms: "0.9", refund: "0.9", contract: "0.9" };

test("동의 기록이 없으면 미동의", () => {
  assert.equal(agreementStatus([]).state, "none");
  assert.equal(agreementStatus(null).state, "none");
  assert.equal(agreementStatus(undefined).label, "미동의");
});

test("현재 버전과 같으면 최신", () => {
  const r = agreementStatus([{ versions: CURRENT, agreed_at: "2026-09-18T00:00:00Z" }]);
  assert.equal(r.state, "current");
  assert.equal(r.label, "최신");
});

test("버전이 다르면 구버전", () => {
  const r = agreementStatus([{ versions: OLD, agreed_at: "2026-09-01T00:00:00Z" }]);
  assert.equal(r.state, "outdated");
  assert.equal(r.label, "구버전");
});

test("행이 여러 개면 가장 늦게 동의한 것으로 판정한다", () => {
  const r = agreementStatus([
    { versions: OLD, agreed_at: "2026-09-01T00:00:00Z" },
    { versions: CURRENT, agreed_at: "2026-09-18T00:00:00Z" },
  ]);
  assert.equal(r.state, "current");
  assert.equal(r.latest?.agreed_at, "2026-09-18T00:00:00Z");
});

test("입력 순서가 뒤집혀도 같은 답이 나온다", () => {
  // 인덱스가 desc 라고 순서를 가정하면 여기서 틀린다
  const r = agreementStatus([
    { versions: CURRENT, agreed_at: "2026-09-18T00:00:00Z" },
    { versions: OLD, agreed_at: "2026-09-01T00:00:00Z" },
  ]);
  assert.equal(r.state, "current");
});

test("최신이 옛 버전이면 과거에 최신 동의가 있어도 구버전", () => {
  // 버전을 되돌린 묶음(2026-09-15) 때문에 실제로 생길 수 있는 모양이다
  const r = agreementStatus([
    { versions: CURRENT, agreed_at: "2026-09-01T00:00:00Z" },
    { versions: OLD, agreed_at: "2026-09-18T00:00:00Z" },
  ]);
  assert.equal(r.state, "outdated");
});

test("날짜가 깨진 행은 최신 후보에서 빠진다", () => {
  const r = agreementStatus([
    { versions: CURRENT, agreed_at: "2026-09-01T00:00:00Z" },
    { versions: OLD, agreed_at: "" },
  ]);
  assert.equal(r.state, "current");
});

test("날짜가 전부 깨져 있으면 미동의로 본다", () => {
  assert.equal(agreementStatus([{ versions: CURRENT, agreed_at: "쓰레기" }]).state, "none");
});

test("버전 칸이 하나라도 빠지면 구버전", () => {
  const { contract: _drop, ...partial } = CURRENT;
  assert.equal(agreementStatus([{ versions: partial, agreed_at: "2026-09-18T00:00:00Z" }]).state, "outdated");
});

test("versions 가 객체가 아니어도 죽지 않는다", () => {
  assert.equal(agreementStatus([{ versions: null, agreed_at: "2026-09-18T00:00:00Z" }]).state, "outdated");
  assert.equal(agreementStatus([{ versions: "1.0", agreed_at: "2026-09-18T00:00:00Z" }]).state, "outdated");
});

test("작가별로 묶는다", () => {
  const m = groupAgreementsByPhotographer([
    { photographer_id: "a", versions: CURRENT, agreed_at: "2026-09-18T00:00:00Z" },
    { photographer_id: "b", versions: OLD, agreed_at: "2026-09-01T00:00:00Z" },
    { photographer_id: "a", versions: OLD, agreed_at: "2026-09-01T00:00:00Z" },
  ]);
  assert.equal(m.get("a")?.length, 2);
  assert.equal(m.get("b")?.length, 1);
  assert.equal(m.get("없는사람"), undefined);
  assert.equal(agreementStatus(m.get("a")).state, "current");
  assert.equal(agreementStatus(m.get("없는사람")).state, "none");
});

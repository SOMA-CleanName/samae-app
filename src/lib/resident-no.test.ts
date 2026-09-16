import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkResidentNo,
  decryptResidentNo,
  encryptResidentNo,
  maskResidentNo,
} from "./resident-no";

// 검증번호가 맞는 값을 만들어 준다 — 테스트에 실재 주민번호를 쓰지 않기 위해.
function withChecksum(first12: string): string {
  const W = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  const sum = W.reduce((a, w, i) => a + w * Number(first12[i]), 0);
  return first12 + String((11 - (sum % 11)) % 10);
}

test("검증번호가 맞으면 통과하고 생년월일을 돌려준다", () => {
  const v = withChecksum("900101" + "1" + "23456");
  const r = checkResidentNo(v);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.birthDate, "1990-01-01");
    assert.equal(r.digits.length, 13);
  }
});

test("2000년대생은 뒤 첫자리 3·4 로 세기를 가른다", () => {
  const r = checkResidentNo(withChecksum("050301" + "3" + "11111"));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.birthDate, "2005-03-01");
});

test("검증번호가 틀리면 막는다", () => {
  const ok = withChecksum("900101" + "1" + "23456");
  const bad = ok.slice(0, 12) + String((Number(ok[12]) + 1) % 10);
  assert.equal(checkResidentNo(bad).ok, false);
});

test("없는 날짜는 검증번호가 맞아도 막는다", () => {
  // 13월 45일 — 체크섬만 보면 통과해 버리는 부류
  const r = checkResidentNo(withChecksum("901345" + "1" + "23456"));
  assert.equal(r.ok, false);
});

test("2월 30일 같은 경계도 막는다", () => {
  assert.equal(checkResidentNo(withChecksum("900230" + "1" + "23456")).ok, false);
});

test("자릿수가 모자라면 막는다", () => {
  assert.equal(checkResidentNo("90010112345").ok, false);
});

test("성별 자리가 0 이나 9 면 막는다", () => {
  assert.equal(checkResidentNo(withChecksum("900101" + "0" + "23456")).ok, false);
  assert.equal(checkResidentNo(withChecksum("900101" + "9" + "23456")).ok, false);
});

test("마스킹은 뒤 6자리를 남기지 않는다", () => {
  const m = maskResidentNo("9001011234567");
  assert.equal(m, "900101-1******");
  assert.ok(!m.includes("234567"));
});

test("암호문은 매번 달라지고, 복호화하면 원래 값이다", () => {
  process.env.RESIDENT_NO_KEY = Buffer.alloc(32, 7).toString("base64");
  const digits = "9001011234567";
  const a = encryptResidentNo(digits);
  const b = encryptResidentNo(digits);
  assert.notEqual(a, b, "같은 값이라도 IV 가 달라 암호문이 같으면 안 된다");
  assert.equal(decryptResidentNo(a), digits);
  assert.equal(decryptResidentNo(b), digits);
});

test("암호문이 한 글자라도 바뀌면 복호화가 실패한다(변조 탐지)", () => {
  process.env.RESIDENT_NO_KEY = Buffer.alloc(32, 7).toString("base64");
  const enc = encryptResidentNo("9001011234567");
  const parts = enc.split(".");
  const last = parts[3];
  parts[3] = (last[0] === "A" ? "B" : "A") + last.slice(1);
  assert.throws(() => decryptResidentNo(parts.join(".")));
});

test("키가 없으면 암호화가 던진다 — 평문으로 새지 않는다", () => {
  const saved = process.env.RESIDENT_NO_KEY;
  delete process.env.RESIDENT_NO_KEY;
  assert.throws(() => encryptResidentNo("9001011234567"), /RESIDENT_NO_KEY/);
  process.env.RESIDENT_NO_KEY = saved;
});

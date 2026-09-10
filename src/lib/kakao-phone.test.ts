import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeKakaoPhone, extractKakaoPhone } from "./kakao-phone.ts";

// 카카오싱크 검수 전에는 실물 응답을 볼 수 없다. 그래서 카카오 문서가 명시한 형식과
// 흔한 변형을 여기에 고정해 두고, 실물이 들어오는 날 어긋나면 여기서 잡는다.

test("카카오 국제표기 → profiles.phone 형식", () => {
  assert.equal(normalizeKakaoPhone("+82 10-1234-5678"), "010-1234-5678");
  assert.equal(normalizeKakaoPhone("+8210-1234-5678"), "010-1234-5678");
  assert.equal(normalizeKakaoPhone("+82 10 1234 5678"), "010-1234-5678");
});

test("이미 국내 표기면 그대로 정규화", () => {
  assert.equal(normalizeKakaoPhone("010-1234-5678"), "010-1234-5678");
  assert.equal(normalizeKakaoPhone("01012345678"), "010-1234-5678");
});

test("해외 번호는 받지 않는다 — 알림톡이 국내로만 나간다", () => {
  assert.equal(normalizeKakaoPhone("+81 90-1234-5678"), null);
  assert.equal(normalizeKakaoPhone("+1 415-555-0100"), null);
});

test("유선·잘린 번호는 null — 저장해 두면 발송 실패가 조용히 쌓인다", () => {
  assert.equal(normalizeKakaoPhone("02-1234-5678"), null);
  assert.equal(normalizeKakaoPhone("010-1234"), null);
  assert.equal(normalizeKakaoPhone(""), null);
  assert.equal(normalizeKakaoPhone(null), null);
  assert.equal(normalizeKakaoPhone(undefined), null);
});

test("metadata 에서 꺼내기 — 평면 키", () => {
  assert.equal(extractKakaoPhone({ phone_number: "+82 10-1234-5678" }), "010-1234-5678");
  assert.equal(extractKakaoPhone({ phoneNumber: "+82 10-1234-5678" }), "010-1234-5678");
});

test("metadata 에서 꺼내기 — kakao_account 중첩", () => {
  assert.equal(
    extractKakaoPhone({ kakao_account: { phone_number: "+82 10-9876-5432" } }),
    "010-9876-5432"
  );
});

test("동의 안 한 계정 → null (기존 OTP 흐름으로 떨어진다)", () => {
  assert.equal(extractKakaoPhone({ name: "김정훈", email: "a@b.c" }), null);
  assert.equal(extractKakaoPhone({}), null);
  assert.equal(extractKakaoPhone(null), null);
  assert.equal(extractKakaoPhone("문자열"), null);
});

test("쓸모없는 값이 섞여 있어도 유효한 것을 찾아낸다", () => {
  assert.equal(
    extractKakaoPhone({ phone: "", kakao_account: { phone_number: "+82 10-1111-2222" } }),
    "010-1111-2222"
  );
});

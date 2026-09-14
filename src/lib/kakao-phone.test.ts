import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeKakaoPhone, extractKakaoPhone, fetchKakaoPhoneFromApi } from "./kakao-phone.ts";

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

// ── 카카오 API 폴백 ──────────────────────────────────────────────
//
// Supabase 가 전화번호를 user_metadata 로 안 넘겨 주는 게 **실측으로 확인됐다**
// (2026-09-11: 동의 후에도 metadata 에 전화번호 키 없음). 그래서 이 경로가
// 실질적인 수집 통로다 — 여기가 조용히 깨지면 알림이 통째로 멈춘다.

/** globalThis.fetch 를 잠깐 갈아끼우고 되돌린다. */
async function withFetch(
  impl: (...args: Parameters<typeof fetch>) => Promise<Response>,
  run: () => Promise<void>
) {
  const original = globalThis.fetch;
  globalThis.fetch = impl as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("API 응답의 kakao_account.phone_number 를 집는다", async () => {
  await withFetch(
    async () => jsonResponse({ id: 1, kakao_account: { phone_number: "+82 10-7715-5195" } }),
    async () => {
      assert.equal(await fetchKakaoPhoneFromApi("tok"), "010-7715-5195");
    }
  );
});

test("토큰이 없으면 네트워크를 치지도 않는다", async () => {
  let called = false;
  await withFetch(
    async () => {
      called = true;
      return jsonResponse({});
    },
    async () => {
      assert.equal(await fetchKakaoPhoneFromApi(null), null);
      assert.equal(await fetchKakaoPhoneFromApi(undefined), null);
      assert.equal(await fetchKakaoPhoneFromApi(""), null);
      assert.equal(called, false);
    }
  );
});

test("Authorization 헤더에 provider_token 을 싣는다", async () => {
  let seen: string | null = null;
  await withFetch(
    async (_url, init) => {
      seen = new Headers(init?.headers).get("authorization");
      return jsonResponse({ kakao_account: { phone_number: "+82 10-1111-2222" } });
    },
    async () => {
      await fetchKakaoPhoneFromApi("abc123");
      assert.equal(seen, "Bearer abc123");
    }
  );
});

test("실패는 전부 null 로 접는다 — 로그인을 막지 않는다", async () => {
  // 토큰 만료·권한 없음
  await withFetch(
    async () => jsonResponse({ msg: "invalid token" }, 401),
    async () => assert.equal(await fetchKakaoPhoneFromApi("tok"), null)
  );
  // 동의는 했는데 카카오계정에 번호가 없는 사람
  await withFetch(
    async () => jsonResponse({ id: 1, kakao_account: {} }),
    async () => assert.equal(await fetchKakaoPhoneFromApi("tok"), null)
  );
  // 네트워크 자체가 죽은 경우
  await withFetch(
    async () => {
      throw new Error("ECONNRESET");
    },
    async () => assert.equal(await fetchKakaoPhoneFromApi("tok"), null)
  );
});

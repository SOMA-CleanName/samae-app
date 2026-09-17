"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 개발 전용 테스트 로그인 — 카카오 계정 없이 가입 이후 흐름을 다시 보기 위한 뒷문.
//
// **왜 필요한가.** 이메일 가입이 꺼져 있어(EMAIL_SIGNUP_ENABLED=false, SMTP 준비 전)
// 가입 경로가 카카오 하나뿐이다. 그런데 QA 하는 사람의 카카오 계정은 **이미 가입돼
// 있다.** 그래서 "처음 온 사람" 화면을 두 번 볼 방법이 없었다. 카카오 계정을 새로
// 파는 건 QA 할 때마다 할 일이 아니다.
//
// ⚠️ 가드가 세 겹이다. 하나라도 뚫리면 남의 계정으로 로그인하는 문이 된다.
//    1. 지면(page.tsx)이 production 에서 notFound()
//    2. 이 액션이 production 에서 그냥 throw — 지면을 우회해도 막힌다
//    3. **`@samae.test` 계정만** 만진다. 실계정은 이름부터 걸리지 않는다
//
// 비밀번호는 서버에서만 쓰인다(클라이언트로 내려가지 않는다).

const TEST_DOMAIN = "@samae.test";
const TEST_PW = "samae-test-2026";

function assertDev() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("테스트 로그인은 개발 환경에서만 동작합니다.");
  }
}

/** 실계정은 절대 손대지 않는다 — 이름으로 먼저 거른다 */
function assertTestAccount(email: string) {
  if (!email.endsWith(TEST_DOMAIN)) {
    throw new Error(`테스트 계정(${TEST_DOMAIN})만 사용할 수 있습니다.`);
  }
}

/** 이미 있는 테스트 계정으로 로그인 */
export async function testSignIn(formData: FormData) {
  assertDev();
  const email = String(formData.get("email") ?? "");
  assertTestAccount(email);
  const next = String(formData.get("next") || "/apply");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: TEST_PW });
  if (error) throw new Error(`로그인 실패: ${error.message}`);
  redirect(next);
}

/**
 * **아무것도 없는 새 사람**으로 시작한다 — 가입 직후 상태를 다시 보기 위한 것.
 *
 * 매번 새 이메일을 만든다. 같은 계정을 재사용하면 신청 이력·작가 행이 남아 있어
 * "처음 온 사람" 이 아니게 된다. 그게 바로 지금 막힌 지점이다.
 */
export async function testSignUpFresh(formData: FormData) {
  assertDev();
  const next = String(formData.get("next") || "/apply");
  const admin = createAdminClient();

  // 초 단위 + 난수. 같은 초에 두 번 눌러도 안 겹친다.
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `qa-fresh-${tag}${TEST_DOMAIN}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PW,
    email_confirm: true, // 메일함이 없는 주소라 확인 링크를 받을 수 없다
    user_metadata: { display_name: "QA 새 지원자" },
  });
  if (error) throw new Error(`계정 생성 실패: ${error.message}`);

  // 프로필은 최소만 — **약관 동의도 번호도 넣지 않는다.**
  // 카카오로 처음 가입한 사람과 같은 상태여야 /signup/consent·/signup/contact 까지 볼 수 있다.
  await admin.from("profiles").upsert({ id: data.user.id, role: "user" }, { onConflict: "id" });

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: TEST_PW,
  });
  if (signInError) throw new Error(`로그인 실패: ${signInError.message}`);
  redirect(next);
}

/** 만들어 둔 qa-fresh-* 계정을 전부 지운다 — 쌓이면 목록이 못 쓰게 된다 */
export async function testCleanupFresh() {
  assertDev();
  const admin = createAdminClient();
  let removed = 0;

  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    for (const u of data.users) {
      if (!u.email?.startsWith("qa-fresh-") || !u.email.endsWith(TEST_DOMAIN)) continue;
      assertTestAccount(u.email); // 한 번 더 — 삭제 직전이 가장 위험한 자리다
      await admin.auth.admin.deleteUser(u.id);
      removed++;
    }
    if (data.users.length < 200) break;
  }
  redirect(`/dev/test-login?removed=${removed}`);
}

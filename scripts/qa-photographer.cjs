// 작가 플로우 QA — 전용 계정 하나를 만들고, 흐름의 아무 단계로나 되돌린다.
//
// 작가 온보딩은 **한 번 지나면 다시 못 보는 관문들**로 이어져 있다. 입점 동의는
// 한 번 누르면 끝이고, 신청은 한 계정에 한 번만 열린다. 그래서 눈으로 확인하려면
// 매번 계정을 새로 파야 했다. 이 스크립트가 그 되감기를 대신한다.
//
//   node scripts/qa-photographer.cjs setup      계정 생성 (최초 1회)
//   node scripts/qa-photographer.cjs status     지금 어느 단계인지
//   node scripts/qa-photographer.cjs apply      ① 신청 전    — /apply 폼부터
//   node scripts/qa-photographer.cjs approve    ② 승인 대기  — 어드민 승인 버튼부터
//   node scripts/qa-photographer.cjs agree      ③ 동의 전    — /studio 입점 동의부터  ★가장 자주
//   node scripts/qa-photographer.cjs profile    ④ 동의 완료  — 사업자 정보 수정만
//   node scripts/qa-photographer.cjs destroy    계정·데이터 전부 삭제
//
// ⚠️ **이 스크립트는 QA 계정 하나만 만진다.** 아래 QA_EMAIL 과 그 계정에 딸린
//    photographers·applications·agreements 행 외에는 어떤 조건으로도 건드리지 않는다.
//    실제 작가 17명이 같은 DB 에 있다 — 그쪽은 이 파일의 사정권 밖이다.

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const QA_EMAIL = "qa-photographer@samae.test";
const QA_PW = "samae-test-2026";
const QA_NAME = "QA작가";
const QA_PHONE = "01000000001"; // 실제 번호 아님 — 알림이 누구에게도 가지 않는다

const envText = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ .env.local 에 SUPABASE_SERVICE_ROLE_KEY 가 없습니다.");
  process.exit(1);
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function findUser() {
  // listUsers 에 이메일 필터가 없어 페이지를 훑는다 (계정 수가 적어 충분하다)
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email === QA_EMAIL);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** QA 계정에 딸린 행만 지운다 — photographer_id 로 좁혀서 */
async function wipe(userId, { keepApplication = false, keepPhotographer = false } = {}) {
  const { data: ph } = await admin
    .from("photographers")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();

  if (ph) {
    await admin.from("photographer_agreements").delete().eq("photographer_id", ph.id);
    if (!keepPhotographer) await admin.from("photographers").delete().eq("id", ph.id);
  }
  if (!keepApplication) {
    await admin.from("photographer_applications").delete().eq("profile_id", userId);
  }
  return ph;
}

async function ensureUser() {
  let user = await findUser();
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: QA_EMAIL,
      password: QA_PW,
      email_confirm: true, // 메일함이 없는 가짜 주소라 확인 링크를 못 받는다
      user_metadata: { display_name: QA_NAME },
    });
    if (error) throw new Error(error.message);
    user = data.user;
    console.log("  ✓ auth 계정 생성");
  }
  // 프로필 — 번호와 약관 동의가 있어야 /signup/contact·/signup/consent 로 안 튄다.
  // 그 둘은 이 스크립트가 보려는 흐름(작가 온보딩)이 아니다.
  await admin.from("profiles").upsert(
    {
      id: user.id,
      role: "user",
      display_name: QA_NAME,
      phone: QA_PHONE,
      terms_agreed_at: new Date().toISOString(),
      terms_version: "1.0",
    },
    { onConflict: "id" }
  );
  return user;
}

async function makeApplication(userId, status) {
  await admin.from("photographer_applications").delete().eq("profile_id", userId);
  const { error } = await admin.from("photographer_applications").insert({
    profile_id: userId,
    display_name: QA_NAME,
    portfolio_url: "https://instagram.com/qa_test",
    phone: QA_PHONE,
    bio: "작가 플로우 QA 용 계정입니다.",
    status,
  });
  if (error) throw new Error(error.message);
}

async function makePhotographer(userId, status) {
  const { data: existing } = await admin
    .from("photographers")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();

  const row = {
    profile_id: userId,
    status,
    display_name: QA_NAME,
    bio: "작가 플로우 QA 용 계정입니다.",
    // 사업자 정보는 비워 둔다 — 입점 동의에서 처음 받는 값이라 미리 채우면 흐름이 건너뛰어진다
    legal_name: null,
    business_type: null,
    business_no: null,
    promo_consent: false,
    promo_consent_at: null,
    ...(status === "approved" ? { approved_at: new Date().toISOString() } : {}),
  };

  if (existing) {
    const { error } = await admin.from("photographers").update(row).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return existing.id;
  }
  const { data, error } = await admin.from("photographers").insert(row).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function status() {
  const user = await findUser();
  if (!user) return console.log("계정 없음 — 먼저 `node scripts/qa-photographer.cjs setup`");

  const { data: prof } = await admin
    .from("profiles")
    .select("phone, terms_agreed_at")
    .eq("id", user.id)
    .maybeSingle();
  const { data: app } = await admin
    .from("photographer_applications")
    .select("status")
    .eq("profile_id", user.id)
    .maybeSingle();
  const { data: ph } = await admin
    .from("photographers")
    .select("id, status, legal_name, business_type, business_no, promo_consent")
    .eq("profile_id", user.id)
    .maybeSingle();
  let agreements = [];
  if (ph) {
    const { data } = await admin
      .from("photographer_agreements")
      .select("agreed_at, versions, promo_consent")
      .eq("photographer_id", ph.id)
      .order("agreed_at", { ascending: false });
    agreements = data || [];
  }

  console.log(`계정        ${QA_EMAIL} / ${QA_PW}`);
  console.log(`프로필      번호 ${prof?.phone || "—"} · 약관동의 ${prof?.terms_agreed_at ? "O" : "X"}`);
  console.log(`신청        ${app ? app.status : "없음"}`);
  console.log(`작가        ${ph ? ph.status : "없음"}`);
  if (ph) {
    console.log(
      `사업자 정보  성명 ${ph.legal_name || "—"} · 유형 ${ph.business_type || "—"} · 번호 ${ph.business_no || "—"} · 홍보동의 ${ph.promo_consent ? "O" : "X"}`
    );
  }
  console.log(`입점 동의    ${agreements.length}건`);
  for (const a of agreements) {
    console.log(`   ${a.agreed_at}  ${JSON.stringify(a.versions)}  홍보:${a.promo_consent ? "O" : "X"}`);
  }

  const stage = !app && !ph ? "① 신청 전"
    : app?.status === "new" ? "② 승인 대기"
    : ph && agreements.length === 0 ? "③ 입점 동의 전"
    : "④ 동의 완료";
  console.log(`\n▶ 지금 단계: ${stage}`);
}

const STAGES = {
  async apply(user) {
    await wipe(user.id);
    console.log("① 신청 전 — 신청·작가·동의 기록 전부 지웠습니다.");
    console.log("   → /apply 에서 폼부터 시작하세요.");
  },
  async approve(user) {
    await wipe(user.id);
    await makeApplication(user.id, "new");
    console.log("② 승인 대기 — 신청이 접수된 상태입니다.");
    console.log("   → /admin/photographers 에서 [승인] 을 누르세요. (어드민 계정 필요)");
  },
  async agree(user) {
    await wipe(user.id, { keepApplication: true });
    await makeApplication(user.id, "approved");
    await makePhotographer(user.id, "approved");
    console.log("③ 입점 동의 전 — 승인된 작가이고, 동의 기록이 없습니다.");
    console.log("   → /studio 에 들어가면 입점 동의 화면이 뜹니다. 사업자 정보도 여기서 처음 받습니다.");
  },
  async profile(user) {
    await wipe(user.id, { keepApplication: true });
    await makeApplication(user.id, "approved");
    const phId = await makePhotographer(user.id, "approved");
    // 현재 버전으로 동의 기록을 심어 관문을 통과시킨다.
    // 버전은 lib/policy-version.ts 를 읽어 맞춘다 — 상수를 여기 복제하면 조용히 어긋난다.
    const versions = readPolicyVersions();
    const { error } = await admin.from("photographer_agreements").insert({
      photographer_id: phId,
      profile_id: user.id,
      versions,
      promo_consent: true,
      ip: "127.0.0.1",
      user_agent: "qa-photographer.cjs",
    });
    if (error) throw new Error(error.message);
    await admin
      .from("photographers")
      .update({
        legal_name: "테스트상호",
        business_type: "general",
        business_no: "000-00-00000",
        promo_consent: true,
        promo_consent_at: new Date().toISOString(),
      })
      .eq("id", phId);
    console.log("④ 동의 완료 — 관문을 통과한 상태입니다.");
    console.log(`   심은 버전: ${JSON.stringify(versions)}`);
    console.log("   → /studio/profile 에서 사업자 정보 수정만 봅니다.");
  },
};

/** policy-version.ts 에서 현재 버전을 읽는다 — 값을 복제하지 않기 위해 */
function readPolicyVersions() {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "policy-version.ts"), "utf8");
  const pick = (name) => {
    const m = src.match(new RegExp(`${name}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`));
    if (!m) throw new Error(`policy-version.ts 에서 ${name} 을 못 찾았습니다 — 스크립트를 갱신하세요.`);
    return m[1];
  };
  return {
    terms: pick("PHOTOGRAPHER_TERMS_VERSION"),
    fee: pick("FEE_POLICY_VERSION"),
    refund: pick("REFUND_POLICY_VERSION"),
    contract: pick("PHOTOGRAPHER_CONTRACT_VERSION"),
  };
}

(async () => {
  const cmd = process.argv[2];

  if (!cmd || cmd === "status") return status();

  if (cmd === "setup") {
    const user = await ensureUser();
    console.log(`\n계정 준비 완료 — ${QA_EMAIL} / ${QA_PW}`);
    console.log(`profile_id: ${user.id}`);
    await STAGES.agree(user); // 가장 자주 쓰는 단계로 열어 둔다
    return;
  }

  if (cmd === "destroy") {
    const user = await findUser();
    if (!user) return console.log("계정이 없습니다.");
    await wipe(user.id);
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new Error(error.message);
    return console.log(`삭제 완료 — ${QA_EMAIL}`);
  }

  if (STAGES[cmd]) {
    const user = await ensureUser();
    await STAGES[cmd](user);
    return;
  }

  console.error(`알 수 없는 명령: ${cmd}`);
  console.error("사용: setup | status | apply | approve | agree | profile | destroy");
  process.exit(1);
})().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});

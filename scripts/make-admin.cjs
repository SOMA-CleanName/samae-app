// 계정을 운영자(admin)로 승격 — QA용. profiles.role 을 'admin' 으로 변경.
// 접속정보: .env.local 의 SUPABASE_DB_URL (migrate.cjs 와 동일 연결 방식).
//
// 사용: node scripts/make-admin.cjs you@example.com
//       node scripts/make-admin.cjs you@example.com user   ← 다시 일반 사용자로 되돌리기
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

// .env.local 파싱
const envText = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const dbUrl = env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("❌ .env.local 에 SUPABASE_DB_URL 이 없습니다.");
  process.exit(1);
}

const email = process.argv[2];
const role = process.argv[3] || "admin"; // 기본 admin, 두번째 인자로 되돌리기(user) 가능
if (!email) {
  console.error("사용법: node scripts/make-admin.cjs <이메일> [admin|user]");
  process.exit(1);
}
if (!["admin", "user"].includes(role)) {
  console.error("❌ role 은 admin 또는 user 만 가능합니다.");
  process.exit(1);
}

// 직접 연결(IPv6 전용)이면 Session pooler 주소로 변환 시도 (migrate.cjs 와 동일)
function poolerCandidates(connStr) {
  const u = new URL(connStr);
  const m = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  if (!m) return [];
  const ref = m[1];
  const regions = [
    "ap-northeast-2", "ap-northeast-1", "ap-southeast-1", "us-east-1",
    "us-west-1", "eu-central-1", "eu-west-1", "ap-south-1", "us-east-2", "sa-east-1",
  ];
  return regions.map(
    (r) =>
      `postgresql://${encodeURIComponent("postgres." + ref)}:${u.password}` +
      `@aws-0-${r}.pooler.supabase.com:5432/postgres`
  );
}

async function connectAny() {
  const candidates = [dbUrl, ...poolerCandidates(dbUrl)];
  let lastErr;
  for (const conn of candidates) {
    const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      console.log(`🔌 DB 연결됨 (${new URL(conn).hostname})\n`);
      return client;
    } catch (e) {
      lastErr = e;
      try { await client.end(); } catch {}
      if (!/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|Tenant or user not found/i.test(e.message)) throw e;
    }
  }
  throw lastErr;
}

(async () => {
  const client = await connectAny();
  // 이메일로 auth 사용자 찾아 profiles.role 변경
  const { rows } = await client.query(
    `update public.profiles
       set role = $2
     where id = (select id from auth.users where email = $1)
     returning id, role`,
    [email, role]
  );
  await client.end();

  if (rows.length === 0) {
    console.error(`❌ '${email}' 계정을 찾지 못했어요. 먼저 해당 이메일로 회원가입했는지 확인하세요.`);
    process.exit(1);
  }
  console.log(`✅ ${email} → role = '${rows[0].role}'`);
  console.log("   (해당 계정 브라우저에서 새로고침하면 사이드바에 어드민🛡️이 보입니다.)");
})().catch((e) => {
  console.error("연결/실행 오류:", e.message);
  process.exit(1);
});

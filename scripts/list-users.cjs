// 가입된 계정 목록 — QA용. 이메일 / 역할 / 작가 상태를 한눈에.
// 접속정보: .env.local 의 SUPABASE_DB_URL (migrate.cjs 와 동일 연결 방식).
//
// 사용: node scripts/list-users.cjs
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
  const { rows } = await client.query(
    `select u.email,
            coalesce(p.role, 'user')      as role,
            p.display_name                as name,
            ph.status                     as photographer,
            u.created_at
       from auth.users u
       left join public.profiles p      on p.id = u.id
       left join public.photographers ph on ph.profile_id = u.id
      order by u.created_at`
  );
  await client.end();

  if (rows.length === 0) {
    console.log("가입된 계정이 없어요.");
    return;
  }

  console.log(`📋 가입 계정 ${rows.length}개\n`);
  console.log("이메일".padEnd(34) + "역할".padEnd(8) + "작가상태".padEnd(12) + "이름");
  console.log("─".repeat(70));
  for (const r of rows) {
    const email = (r.email || "—").padEnd(34);
    const role = (r.role || "user").padEnd(8);
    const ph = (r.photographer || "-").padEnd(12);
    console.log(email + role + ph + (r.name || ""));
  }
  console.log(
    "\n작가상태: approved=승인됨(테스트 가능) · pending=승인 대기 · '-'=작가 아님"
  );
})().catch((e) => {
  console.error("연결/실행 오류:", e.message);
  process.exit(1);
});

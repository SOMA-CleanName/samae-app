// 로컬 마이그레이션 실행기 — supabase/migrations/*.sql 을 순서대로 실행.
// 접속정보: .env.local 의 SUPABASE_DB_URL (Supabase → Settings → Database → Connection string).
//
// 사용: node scripts/migrate.cjs            (전체 실행)
//       node scripts/migrate.cjs 0002       (파일명에 인자 포함된 것만)
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

const filter = process.argv[2]; // 선택: 특정 파일만
const dir = path.join(__dirname, "..", "supabase", "migrations");
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => !filter || f.includes(filter))
  .sort();

// 직접 연결(db.<ref>.supabase.co, IPv6 전용)이면 Session pooler 주소로 변환 시도.
// 리전을 모르므로 후보 리전을 순서대로 시도한다.
function poolerCandidates(connStr) {
  const u = new URL(connStr);
  const m = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  if (!m) return []; // 이미 pooler거나 다른 형식
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
      const host = new URL(conn).hostname;
      console.log(`🔌 DB 연결됨 (${host})\n`);
      return client;
    } catch (e) {
      lastErr = e;
      try { await client.end(); } catch {}
      // DNS 실패·리전 불일치(Tenant not found)면 다음 후보로, 실제 인증 실패면 즉시 중단
      if (!/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|Tenant or user not found/i.test(e.message)) throw e;
    }
  }
  throw lastErr;
}

(async () => {
  const client = await connectAny();

  // 적용 이력 테이블 (재실행 시 이미 적용된 마이그레이션은 건너뜀)
  await client.query(
    "create table if not exists public._migrations (name text primary key, applied_at timestamptz default now())"
  );
  const applied = new Set(
    (await client.query("select name from public._migrations")).rows.map((r) => r.name)
  );

  for (const f of files) {
    if (applied.has(f)) {
      console.log(`⏭️  ${f} (이미 적용됨)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into public._migrations(name) values($1)", [f]);
      await client.query("commit");
      console.log(`✅ ${f}`);
    } catch (e) {
      await client.query("rollback").catch(() => {});
      // 추적 도입 전 적용된 레거시(0001/0002 등): "already exists" 면 적용된 것으로 기록
      if (/already exists/i.test(e.message)) {
        await client.query("insert into public._migrations(name) values($1) on conflict do nothing", [f]);
        console.log(`⏭️  ${f} (기존 적용분으로 인식 — already exists)`);
      } else {
        console.error(`❌ ${f}\n   ${e.message}`);
        await client.end();
        process.exit(1);
      }
    }
  }
  // 결과 확인: public 테이블 목록
  const { rows } = await client.query(
    "select tablename from pg_tables where schemaname='public' order by tablename"
  );
  console.log(`\n📋 public 테이블 ${rows.length}개:`, rows.map((r) => r.tablename).join(", "));
  await client.end();
  console.log("🎉 마이그레이션 완료");
})().catch((e) => {
  console.error("연결/실행 오류:", e.message);
  process.exit(1);
});

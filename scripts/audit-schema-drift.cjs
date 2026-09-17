// 운영 DB 에 있으나 repo 마이그레이션에 정의가 없는 객체를 찾는다. 읽기만 한다.
//
// 이 프로젝트는 마이그레이션을 거치지 않고 운영 DB 를 직접 손본 전례가 여러 번 있다
// (docs/22 §6.4·§11). 그러면 코드만 읽어서는 실제 스키마를 알 수 없고, 0121 처럼
// 원인 모를 장애로 뒤늦게 드러난다. 주기적으로 돌려 간극을 눈에 보이게 한다.
//
// 사용: node scripts/audit-schema-drift.cjs

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATIONS = path.join(__dirname, "..", "supabase", "migrations");

function readDbUrl() {
  const env = {};
  for (const line of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  const direct = process.env.SUPABASE_DB_URL || env.SUPABASE_DB_URL;
  if (!direct) throw new Error("SUPABASE_DB_URL 을 찾지 못했습니다.");
  const u = new URL(direct);
  const ref = u.hostname.match(/^db\.([a-z0-9]+)\./)?.[1];
  if (!ref) return direct;
  // 직접 연결은 IPv6 전용이라 이 회선에서 안 된다. Session pooler 로 돌린다(docs/22 §11).
  return `postgresql://${encodeURIComponent("postgres." + ref)}:${u.password}`
    + "@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres";
}

function migrationText() {
  return fs.readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(MIGRATIONS, f), "utf8"))
    .join("\n")
    .toLowerCase();
}

async function main() {
  const sql = migrationText();
  const client = new Client({ connectionString: readDbUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  const q = async (text) => (await client.query(text)).rows;

  const tables = await q(`
    select c.relname as name, c.relrowsecurity as rls,
           coalesce(s.n_live_tup, 0)::int as rows
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname`);

  // 제약조건이 자동으로 만드는 인덱스(_pkey·_key)는 SQL 에 이름이 안 적힌다. 세면 거짓 양성이다.
  const indexes = await q(`
    select i.relname as name, t.relname as owner
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    join pg_class t on t.oid = x.indrelid
    join pg_namespace n on n.oid = i.relnamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_constraint c where c.conindid = i.oid)
    order by t.relname, i.relname`);

  const functions = await q(`
    select p.proname as name, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
    where n.nspname = 'public' and p.prokind in ('f','p') and d.objid is null
    order by p.proname`);

  await client.end();

  const unknown = (rows) => rows.filter((r) => !sql.includes(r.name.toLowerCase()));
  let total = 0;

  const orphanTables = unknown(tables);
  total += orphanTables.length;
  console.log(`■ 테이블 — DB ${tables.length}개 중 repo 에 정의가 없는 것 ${orphanTables.length}개`);
  for (const t of orphanTables) {
    console.log(`   ${t.name.padEnd(32)} ${String(t.rows).padStart(6)}행   RLS ${t.rls ? "켜짐" : "⚠️  꺼짐"}`);
  }

  const orphanIndexes = unknown(indexes);
  total += orphanIndexes.length;
  console.log(`\n■ 인덱스(제약조건 자동 생성분 제외) — DB ${indexes.length}개 중 ${orphanIndexes.length}개`);
  const owned = new Set(orphanTables.map((t) => t.name));
  const standalone = orphanIndexes.filter((i) => !owned.has(i.owner));
  console.log(`   그중 ${standalone.length}개는 repo 가 아는 테이블에 붙어 있다 — 이쪽이 더 놀랍다`);
  for (const i of standalone.slice(0, 40)) console.log(`   ${i.name.padEnd(48)} ← ${i.owner}`);
  if (standalone.length > 40) console.log(`   … 외 ${standalone.length - 40}개`);

  const orphanFunctions = unknown(functions);
  total += orphanFunctions.length;
  console.log(`\n■ 함수 — DB ${functions.length}개 중 ${orphanFunctions.length}개`);
  for (const f of orphanFunctions.slice(0, 40)) console.log(`   ${f.name}(${f.args})`);
  if (orphanFunctions.length > 40) console.log(`   … 외 ${orphanFunctions.length - 40}개`);

  console.log(`\n${total === 0 ? "✅ 간극 없음" : `⚠️  모두 ${total}개. 이름만 대조하므로 본문이 다른 것은 못 잡는다.`}`);
  if (total > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("실패:", e.message); process.exit(1); });

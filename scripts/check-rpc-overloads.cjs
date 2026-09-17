// 같은 이름의 함수가 DB 에 여러 개 있는지 본다. 읽기만 한다.
//
// create or replace function 은 인자 타입이 정확히 같을 때만 대체하고, 다르면
// 조용히 하나 더 만든다. 앱이 인자를 문자열로 넘기면 어느 판인지 정해지지 않아
// "Could not choose the best candidate function" 으로 호출이 통째로 실패한다.
// 0080(similar_photos_by_embedding)·0121(similar_photos_by_vector) 이 그 사고였다.
//
// 사용: node scripts/check-rpc-overloads.cjs

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function readDbUrl() {
  const env = {};
  const envPath = path.join(__dirname, "..", ".env.local");
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
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

async function main() {
  const client = new Client({ connectionString: readDbUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  const { rows } = await client.query(`
    select p.proname,
           count(*)                                                    as copies,
           array_agg(pg_get_function_arguments(p.oid) order by p.oid)  as variants,
           array_agg(p.oid order by p.oid)                             as oids
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
    group by p.proname
    having count(*) > 1
    order by count(*) desc, p.proname`);

  await client.end();

  if (!rows.length) {
    console.log("✅ 이름이 겹치는 함수 없음");
    return;
  }
  console.log(`⚠️  이름이 겹치는 함수 ${rows.length}개\n`);
  for (const r of rows) {
    console.log(`■ ${r.proname} — ${r.copies}개`);
    r.variants.forEach((v, i) => console.log(`   [oid ${r.oids[i]}] (${v})`));
    console.log();
  }
  console.log("오버로드 자체는 문제가 아니다. 앱이 타입이 안 정해진 값(JSON 문자열 등)으로");
  console.log("부르는 함수가 위에 있다면 호출이 실패한다 — 마이그레이션으로 하나만 남길 것.");
  process.exitCode = 1;
}

main().catch((e) => { console.error("실패:", e.message); process.exit(1); });

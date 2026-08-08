// _migrations 추적 격차 점검·백필 — 파일이 실제로 적용됐는지 DB 에서 확인한 뒤 기록한다.
//
//   node scripts/verify-migrations.cjs           # 점검만 (읽기 전용)
//   node scripts/verify-migrations.cjs --apply   # 확인된 것만 _migrations 에 기록
//
// 왜 이 스크립트가 필요한가 (docs/22 §12.2)
//   _migrations 추적이 0047 에서 멈춰 있다. 그 뒤 파일들은 프로덕션에 적용돼 있지만
//   기록이 없어서, `node scripts/migrate.cjs` 를 인자 없이 돌리면 전부 재실행된다.
//   create or replace function 은 에러 없이 프로덕션 함수를 덮어쓰므로 위험하다.
//
//   그렇다고 "전부 적용됐다" 고 일괄 insert 하면 그것대로 단언이다. 실제로 빠진
//   마이그레이션이 하나라도 있으면 영영 적용되지 않는 채로 묻힌다.
//
//   그래서 **파일이 만든다고 선언한 객체가 DB 에 실제로 있는지 확인**하고,
//   확인된 것만 기록한다. 확인 못 한 것은 사람이 판단하도록 남긴다.

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ROOT = path.join(__dirname, "..");
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const APPLY = process.argv.includes("--apply");
const DIR = path.join(ROOT, "supabase/migrations");

// 파일에서 "이 마이그레이션이 만든다고 선언한 것" 을 뽑는다.
function declaredObjects(sql) {
  const s = sql.replace(/--[^\n]*/g, ""); // 주석 제거 (되돌리기 예시가 잡히지 않게)
  const objs = [];
  const push = (kind, name, extra) => name && objs.push({ kind, name: name.toLowerCase(), extra });

  for (const m of s.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi))
    push("table", m[1]);
  for (const m of s.matchAll(/create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?"?(\w+)"?/gi))
    push("index", m[1]);
  for (const m of s.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?(\w+)"?/gi))
    push("function", m[1]);
  for (const m of s.matchAll(/create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?"?(\w+)"?/gi))
    push("view", m[1]);
  for (const m of s.matchAll(/create\s+trigger\s+"?(\w+)"?/gi)) push("trigger", m[1]);
  for (const m of s.matchAll(/create\s+type\s+(?:public\.)?"?(\w+)"?/gi)) push("type", m[1]);
  for (const m of s.matchAll(/create\s+policy\s+"([^"]+)"/gi)) push("policy", m[1]);

  // alter table … add column — 테이블마다 컬럼 목록을 모은다
  for (const m of s.matchAll(/alter\s+table\s+(?:public\.)?"?(\w+)"?([\s\S]*?);/gi)) {
    const table = m[1];
    for (const c of m[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?/gi))
      push("column", c[1], table.toLowerCase());
  }
  return objs;
}

(async () => {
  const u = new URL(process.env.SUPABASE_DB_URL);
  const ref = u.hostname.match(/^db\.([a-z0-9]+)\./)?.[1];
  const conn = ref
    ? `postgresql://${encodeURIComponent("postgres." + ref)}:${u.password}@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres`
    : process.env.SUPABASE_DB_URL;
  const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const applied = new Set(
    (await c.query("select name from public._migrations")).rows.map((r) => r.name)
  );
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  const missing = files.filter((f) => !applied.has(f));

  console.log(`파일 ${files.length}개 · 기록됨 ${applied.size}개 · 미기록 ${missing.length}개\n`);
  if (missing.length === 0) {
    console.log("✅ 격차 없음");
    await c.end();
    return;
  }

  // DB 의 실제 객체 목록을 한 번에 받아둔다
  const q = async (sql) => (await c.query(sql)).rows.map((r) => Object.values(r)[0].toLowerCase());
  const have = {
    table: new Set(await q("select tablename from pg_tables where schemaname='public'")),
    index: new Set(await q("select indexname from pg_indexes where schemaname='public'")),
    function: new Set(await q("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")),
    view: new Set(await q("select viewname from pg_views where schemaname='public'")),
    trigger: new Set(await q("select tgname from pg_trigger where not tgisinternal")),
    type: new Set(await q("select typname from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public'")),
    // 정책은 스키마를 한정하지 않는다 — storage.objects 에 거는 것들이 있어서
    // public 만 보면 멀쩡한 마이그레이션을 '누락' 으로 오판한다. (0068_about_sections 사례)
    policy: new Set(await q("select policyname from pg_policies")),
  };
  const colRows = (await c.query(
    "select table_name, column_name from information_schema.columns where table_schema='public'"
  )).rows;
  const haveCol = new Set(colRows.map((r) => `${r.table_name.toLowerCase()}.${r.column_name.toLowerCase()}`));

  const ok = [], partial = [], unknown = [];
  for (const f of missing) {
    const objs = declaredObjects(fs.readFileSync(path.join(DIR, f), "utf8"));
    if (objs.length === 0) { unknown.push({ f, objs }); continue; }
    const bad = objs.filter((o) =>
      o.kind === "column" ? !haveCol.has(`${o.extra}.${o.name}`) : !have[o.kind]?.has(o.name)
    );
    (bad.length === 0 ? ok : partial).push({ f, objs, bad });
  }

  console.log(`■ 적용 확인됨 — 선언한 객체가 DB 에 전부 있음 (${ok.length}개)`);
  for (const { f, objs } of ok) console.log(`   ✅ ${f}  (객체 ${objs.length})`);

  if (partial.length) {
    console.log(`\n■ 일부 누락 — 사람이 판단할 것 (${partial.length}개)`);
    for (const { f, bad } of partial)
      console.log(`   ⚠️  ${f}\n        없는 객체: ${bad.map((b) => `${b.kind} ${b.extra ? b.extra + "." : ""}${b.name}`).join(", ")}`);
  }
  if (unknown.length) {
    console.log(`\n■ 판정 불가 — 만드는 객체를 못 찾음(데이터 조작·제약 변경 등) (${unknown.length}개)`);
    for (const { f } of unknown) console.log(`   ❔ ${f}`);
  }

  if (!APPLY) {
    console.log(`\n기록하려면 --apply. '적용 확인됨' ${ok.length}개만 기록한다.`);
    await c.end();
    return;
  }

  await c.query("begin");
  for (const { f } of ok)
    await c.query("insert into public._migrations(name) values($1) on conflict do nothing", [f]);
  await c.query("commit");
  const now = (await c.query("select count(*)::int n from public._migrations")).rows[0].n;
  console.log(`\n✅ ${ok.length}개 기록. _migrations 총 ${now}개 · 남은 미기록 ${files.length - now}개`);
  if (partial.length || unknown.length)
    console.log("   ⚠️  위 '일부 누락'·'판정 불가' 는 기록하지 않았다. 확인 후 수동 처리할 것.");
  await c.end();
})().catch((e) => {
  console.error("오류:", e.message);
  process.exit(1);
});

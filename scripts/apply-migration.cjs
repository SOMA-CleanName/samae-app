// 마이그레이션 SQL 1개를 SUPABASE_DB_URL 로 직접 적용한다.
// 사용: node scripts/apply-migration.cjs supabase/migrations/0041_inquiry_status_revise.sql
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

// .env.local 에서 SUPABASE_DB_URL 만 파싱
function readDbUrl() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^SUPABASE_DB_URL=(.*)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("SUPABASE_DB_URL 을 .env.local 에서 찾지 못했어요.");
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("적용할 마이그레이션 파일 경로를 인자로 주세요.");
  const sql = fs.readFileSync(path.join(__dirname, "..", file), "utf8");

  const client = new Client({
    connectionString: readDbUrl(),
    // Supabase 풀러는 자체 서명 CA 체인이라 공인 신뢰저장소로는 검증 불가 → 암호화는 유지하되 체인 검증만 생략.
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql); // 멀티 스테이트먼트 → 단일 암묵 트랜잭션
    console.log(`✅ 적용 완료: ${file}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("❌ 적용 실패:", e.message);
  process.exit(1);
});

// 마이그레이션 SQL 1개를 SUPABASE_DB_URL 로 직접 적용한다.
// 사용: node scripts/apply-migration.cjs supabase/migrations/0041_inquiry_status_revise.sql
//
// 직결 호스트(db.<ref>.supabase.co)는 IPv6 전용이라 IPv4 망에서는 ENOTFOUND 가 난다.
// 그럴 땐 .env.local 에 IPv4 지원 pooler URL 을 SUPABASE_DB_POOLER_URL 로 넣어두면 그걸 먼저 쓴다.
//   SUPABASE_DB_POOLER_URL=postgresql://postgres.<ref>:<pw>@aws-1-<region>.pooler.supabase.com:5432/postgres
//   (DDL 이라 트랜잭션 모드 6543 이 아니라 세션 모드 5432 를 쓸 것)
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

// .env.local 에서 접속 URL 파싱 — pooler 가 있으면 우선
function readDbUrl() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const text = fs.readFileSync(envPath, "utf8");
  const found = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(SUPABASE_DB_POOLER_URL|SUPABASE_DB_URL)=(.*)$/);
    if (m) found[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  const url =
    process.env.SUPABASE_DB_POOLER_URL || found.SUPABASE_DB_POOLER_URL || found.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL 을 .env.local 에서 찾지 못했어요.");
  return url;
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
  if (e.code === "ENOTFOUND" && /^db\./.test(e.hostname || "")) {
    console.error("   → 직결 호스트는 IPv6 전용이에요. .env.local 에 SUPABASE_DB_POOLER_URL 을 추가하세요(파일 상단 주석 참고).");
  }
  process.exit(1);
});

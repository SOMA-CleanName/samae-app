// QA용 데이터 초기화 — 채팅/예약/찜 등 유저 활동 내역 삭제.
//   삭제: messages, consultation_briefs, conversations, reviews, deliveries,
//         platform_fees, payments, bookings, notifications, favorites
//   유지: profiles, photographers, photos, packages, availability*, payout_accounts, albums
//
// 안전장치: 기본은 '미리보기'(개수만). 실제 삭제는 --yes 를 붙여야 실행.
//   미리보기: node scripts/clear-qa.cjs
//   실삭제 : node scripts/clear-qa.cjs --yes
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

const confirmed = process.argv.includes("--yes");

// 자식 → 부모 순서 (FK 위반 방지)
const TABLES = [
  "messages",
  "consultation_briefs",
  "reviews",
  "deliveries",
  "platform_fees",
  "payments",
  "conversations",
  "bookings",
  "notifications",
  "favorites",
];

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

  // 현재 개수 출력
  console.log("📊 현재 행 수:");
  for (const t of TABLES) {
    const { rows } = await client.query(`select count(*)::int as n from public.${t}`);
    console.log(`   ${t.padEnd(22)} ${rows[0].n}`);
  }

  if (!confirmed) {
    console.log("\n👀 미리보기입니다. 실제로 지우려면:  node scripts/clear-qa.cjs --yes");
    console.log("   (계정·작가·사진·패키지·가용시간은 그대로 유지됩니다.)");
    await client.end();
    return;
  }

  // 실제 삭제 (트랜잭션)
  console.log("\n🧹 삭제 중…");
  try {
    await client.query("begin");
    for (const t of TABLES) {
      const res = await client.query(`delete from public.${t}`);
      console.log(`   ${t.padEnd(22)} -${res.rowCount}`);
    }
    await client.query("commit");
    console.log("\n✅ 채팅/예약 내역 삭제 완료");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    console.error(`❌ 실패(롤백됨): ${e.message}`);
    await client.end();
    process.exit(1);
  }
  await client.end();
})().catch((e) => {
  console.error("연결/실행 오류:", e.message);
  process.exit(1);
});

// 유사사진 RPC의 최대 요청 경계(p_limit=300)가 실제 DB에서 동작하는지 확인한다.
// 사용: node scripts/check-similar-photos-rpc.cjs

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function readDbUrl() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const env = {};

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }

  const directUrl = process.env.SUPABASE_DB_URL || env.SUPABASE_DB_URL;
  if (!directUrl) throw new Error("SUPABASE_DB_URL을 찾지 못했습니다.");

  const parsed = new URL(directUrl);
  const projectRef = parsed.hostname.match(/^db\.([a-z0-9]+)\./)?.[1];
  if (!projectRef) return directUrl;

  return `postgresql://${encodeURIComponent(`postgres.${projectRef}`)}:${parsed.password}`
    + "@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres";
}

async function main() {
  const client = new Client({
    connectionString: readDbUrl(),
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query("begin read only");
    const seed = await client.query(`
      select id
      from public.photos
      where visibility = 'published' and embedding is not null
      order by created_at desc
      limit 1
    `);
    if (seed.rowCount !== 1) throw new Error("검증할 임베딩 사진이 없습니다.");

    const result = await client.query(
      "select count(*)::int as count from public.similar_photos_by_embedding($1, 300)",
      [seed.rows[0].id],
    );
    const count = result.rows[0].count;
    if (count < 1 || count > 300) {
      throw new Error(`유사사진 반환 수가 범위를 벗어났습니다: ${count}`);
    }

    await client.query("rollback");
    console.log(`✅ 유사사진 RPC 최대 요청 정상 · ${count}장 반환`);
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("❌ 유사사진 RPC 검증 실패:", error.message);
  process.exit(1);
});

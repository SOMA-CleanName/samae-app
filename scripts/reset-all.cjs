// ⚠️ 전체 데이터 초기화 — 실서비스 배포 전 테스트 계정/콘텐츠/거래/스토리지 전부 하드딜리트.
//   삭제: 모든 public 데이터 테이블 + auth.users + 스토리지 버킷 파일
//   보존: categories, platform_account, _migrations (설정/시드/마이그레이션 추적)
//   접속: .env 의 NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (service_role, RLS 우회)
//
// 안전장치:
//   미리보기(기본, 읽기전용): node scripts/reset-all.cjs
//   실제 삭제             : node scripts/reset-all.cjs --yes
//   관리자 계정 보존       : --keep-admin   (role='admin' 계정은 유지, 그 외 전부 삭제)
const fs = require("fs");
const path = require("path");
// Node 20 엔 native WebSocket 이 없음 → realtime 미사용이므로 스텁만 제공(접속 안 함)
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class { constructor() { throw new Error("realtime disabled"); } };
}
const { createClient } = require("@supabase/supabase-js");

// .env 파싱 (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
function loadEnv(file) {
  const out = {};
  try {
    const txt = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
}
const env = { ...loadEnv(".env"), ...loadEnv(".env.local") };
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("❌ .env 에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  process.exit(1);
}

const CONFIRMED = process.argv.includes("--yes");
const KEEP_ADMIN = process.argv.includes("--keep-admin");
// --keep-email=a@b.com,c@d.com → 해당 계정 + 그들의 profiles 행(권한) 보존
const keepEmailArg = process.argv.find((a) => a.startsWith("--keep-email="));
const KEEP_EMAILS = keepEmailArg
  ? keepEmailArg.slice("--keep-email=".length).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  : [];
const NIL = "00000000-0000-0000-0000-000000000000";

const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// 자식 → 부모 FK 안전 순서. {pk} 는 전체삭제 필터용(없으면 'id').
const TABLES = [
  { t: "messages" },
  { t: "consultation_briefs", pk: "conversation_id" },
  { t: "reviews" },
  { t: "deliveries" },
  { t: "settlements" },
  { t: "platform_fees" },
  { t: "payments" },
  { t: "conversations" },
  { t: "bookings" },
  { t: "inquiries" },
  { t: "highlight_items" },
  { t: "highlights" },
  { t: "favorites" },
  { t: "notifications" },
  { t: "analytics_events" },
  { t: "availability_blocks" },
  { t: "availability_rules" },
  { t: "availability" },
  { t: "packages" },
  { t: "photos" },
  { t: "albums" },
  { t: "payout_accounts", pk: "photographer_id" },
  { t: "photographer_applications" },
  { t: "photographers" },
  { t: "profiles" },
  { t: "deleted_records" },
];

const BUCKETS = ["samae-portfolio", "samae-chat", "samae-delivery", "samae-highlight", "samae-avatar"];

async function countRows(t) {
  const { count, error } = await sb.from(t).select("*", { count: "exact", head: true });
  if (error) return `(err: ${error.message})`;
  return count ?? 0;
}

async function listAllUsers() {
  const users = [];
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

// 버킷 내 모든 객체 경로 재귀 수집
async function listBucketPaths(bucket, prefix = "") {
  const paths = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) {
      if (/not found/i.test(error.message)) return paths; // 버킷 없음
      throw new Error(`${bucket}: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    for (const item of data) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        // 폴더 → 재귀
        const sub = await listBucketPaths(bucket, full);
        paths.push(...sub);
      } else {
        paths.push(full);
      }
    }
    if (data.length < 1000) break;
    offset += data.length;
  }
  return paths;
}

(async () => {
  console.log(`🔌 ${URL}\n`);

  // ── 미리보기: 행 수 ──
  console.log("📊 삭제 대상 테이블 행 수:");
  let totalRows = 0;
  for (const { t } of TABLES) {
    const n = await countRows(t);
    if (typeof n === "number") totalRows += n;
    console.log(`   ${t.padEnd(26)} ${n}`);
  }
  console.log(`   ${"─".repeat(30)}\n   합계 ${totalRows} 행`);

  // ── 미리보기: 계정 ──
  const users = await listAllUsers();
  const roleById = {};
  {
    const { data } = await sb.from("profiles").select("id, role");
    for (const r of data ?? []) roleById[r.id] = r.role;
  }
  const admins = users.filter((u) => roleById[u.id] === "admin");
  console.log(`\n👥 가입 계정 ${users.length}개 (관리자 ${admins.length}명):`);
  for (const u of users) {
    const role = roleById[u.id] || "user";
    console.log(`   ${(u.email || u.id).padEnd(36)} ${role}`);
  }

  // ── 미리보기: 스토리지 ──
  console.log(`\n🗂️  스토리지 버킷 파일 수:`);
  const bucketPaths = {};
  let totalFiles = 0;
  for (const b of BUCKETS) {
    const paths = await listBucketPaths(b);
    bucketPaths[b] = paths;
    totalFiles += paths.length;
    console.log(`   ${b.padEnd(20)} ${paths.length}`);
  }
  console.log(`   ${"─".repeat(24)}\n   합계 ${totalFiles} 파일`);

  // 보존할 계정 id 집합 (관리자 전체 또는 지정 이메일)
  const keepIds = new Set(
    KEEP_ADMIN
      ? admins.map((u) => u.id)
      : users.filter((u) => KEEP_EMAILS.includes((u.email || "").toLowerCase())).map((u) => u.id)
  );
  const keptLabel =
    keepIds.size > 0
      ? users.filter((u) => keepIds.has(u.id)).map((u) => u.email).join(", ")
      : "(없음 — 전체 삭제)";
  console.log(`\n🔐 보존 계정: ${keptLabel}`);

  if (!CONFIRMED) {
    console.log("\n👀 미리보기입니다. 실제로 지우려면:");
    console.log("     node scripts/reset-all.cjs --yes --keep-email=jeong01101095@gmail.com,tpgus0510@naver.com");
    console.log("     node scripts/reset-all.cjs --yes --keep-admin   (admin 전체 보존)");
    console.log("     node scripts/reset-all.cjs --yes                (관리자 포함 전부 삭제)");
    console.log("   보존 테이블: categories, platform_account, _migrations");
    return;
  }

  // ════════════ 실제 삭제 ════════════
  console.log(`\n🧹 삭제 시작 (보존 계정 ${keepIds.size}개)…\n`);
  const keepArr = [...keepIds];

  // 1) 데이터 테이블 — profiles 만 보존 계정 제외, 나머지는 전부 삭제
  for (const { t, pk } of TABLES) {
    const col = pk || "id";
    let q = sb.from(t).delete();
    if (t === "profiles" && keepArr.length > 0) {
      q = q.not("id", "in", `(${keepArr.join(",")})`);
    } else {
      q = q.neq(col, NIL);
    }
    const { error } = await q;
    console.log(`   ${t.padEnd(26)} ${error ? "❌ " + error.message : "비움"}`);
  }

  // 2) auth.users
  let delUsers = 0;
  for (const u of users) {
    if (keepIds.has(u.id)) continue;
    const { error } = await sb.auth.admin.deleteUser(u.id);
    if (error) console.log(`   ⚠️ user ${u.email}: ${error.message}`);
    else delUsers++;
  }
  console.log(`\n   계정 ${delUsers}개 삭제${KEEP_ADMIN ? `, 관리자 ${keepIds.size}개 보존` : ""}`);

  // 3) 스토리지 파일 (관리자 보존 시에도 콘텐츠는 전부 삭제 — 테스트 게시물 정리 목적)
  console.log("");
  for (const b of BUCKETS) {
    const paths = bucketPaths[b];
    if (paths.length === 0) {
      console.log(`   ${b.padEnd(20)} (비어있음)`);
      continue;
    }
    // remove 는 한 번에 다량 가능하나 안전하게 1000개씩
    let removed = 0;
    for (let i = 0; i < paths.length; i += 1000) {
      const chunk = paths.slice(i, i + 1000);
      const { error } = await sb.storage.from(b).remove(chunk);
      if (error) console.log(`   ⚠️ ${b}: ${error.message}`);
      else removed += chunk.length;
    }
    console.log(`   ${b.padEnd(20)} ${removed}개 파일 삭제`);
  }

  console.log("\n✅ 초기화 완료");
})().catch((e) => {
  console.error("\n오류:", e.message);
  process.exit(1);
});

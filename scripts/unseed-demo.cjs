// ════════════════════════════════════════════════════════════════
// 데모 공급 데이터 정리 — demo+*@samae.test auth user 삭제.
// profiles→photographers→photos/packages/availability 가 전부 cascade 삭제된다.
// 단독 실행: node scripts/unseed-demo.cjs
// ════════════════════════════════════════════════════════════════
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

function loadAdmin() {
  const t = fs.readFileSync(".env.local", "utf8");
  const env = {};
  for (const l of t.split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// 데모 auth user 전부 삭제 (페이지네이션). 반환: 삭제 수.
async function removeDemo(admin) {
  let removed = 0;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const users = data.users || [];
    const demo = users.filter((u) => (u.email || "").startsWith("demo+") && (u.email || "").endsWith("@samae.test"));
    for (const u of demo) {
      await admin.auth.admin.deleteUser(u.id); // cascade: profile→photographer→photos/packages/availability
      removed++;
    }
    if (users.length < 200) break;
  }
  // 혹시 모를 고아 photographer(demo_ 핸들) 방어적 정리
  await admin.from("photographers").delete().like("handle", "demo_%");
  return removed;
}

module.exports = { removeDemo };

if (require.main === module) {
  const admin = loadAdmin();
  removeDemo(admin)
    .then((n) => { console.log(`🧹 데모 auth user ${n}명 삭제 (관련 데이터 cascade).`); process.exit(0); })
    .catch((e) => { console.error("❌", e.message); process.exit(1); });
}

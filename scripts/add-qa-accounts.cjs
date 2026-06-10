// QA용 추가 목업 계정 — 작가 1 + 유저 1 (기존 데모는 건드리지 않음).
//   작가: demo+qa@samae.test  (승인됨 · 사진6 · 패키지2 · 슬롯4)
//   유저: demo+qauser@samae.test
//   비밀번호(공통): demo-pw-123456
//
// 재실행 안전: 같은 이메일이 이미 있으면 삭제(cascade) 후 새로 만든다.
// 사용: node scripts/add-qa-accounts.cjs
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const t = fs.readFileSync(".env.local", "utf8");
const env = {};
for (const l of t.split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const PW = "demo-pw-123456";

// 추가할 작가 1명
const PHOTOGRAPHER = {
  slug: "qa", name: "테스트 작가", regions: ["성수"], moods: ["내추럴", "필름"],
  bio: "QA용 테스트 작가입니다. 자유롭게 문의·예약 흐름을 테스트하세요.",
  packages: [
    { name: "기본 스냅", price: 100000, dur: 60, edited: 15 },
    { name: "프리미엄 스냅", price: 180000, dur: 90, edited: 30 },
  ],
};

// 이메일로 기존 auth 사용자 찾기 (있으면 삭제 → cascade)
async function resetUser(email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const found = data.users.find((u) => u.email === email);
  if (found) {
    await admin.auth.admin.deleteUser(found.id);
    console.log(`♻️  기존 ${email} 삭제(재생성)`);
  }
}

async function createPhotographer(p) {
  const email = `demo+${p.slug}@samae.test`;
  await resetUser(email);

  // 1) auth user → profile(트리거)
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email, password: PW, email_confirm: true, user_metadata: { name: p.name },
  });
  if (uErr) throw new Error(`user ${email}: ${uErr.message}`);

  // 2) photographer (승인 상태)
  const { data: ph, error: phErr } = await admin.from("photographers").insert({
    profile_id: u.user.id,
    handle: `demo_${p.slug}`,
    status: "approved",
    display_name: p.name,
    bio: p.bio,
    regions: p.regions,
    mood_tags: p.moods,
    price_from_krw: Math.min(...p.packages.map((k) => k.price)),
    approved_at: new Date().toISOString(),
  }).select("id").single();
  if (phErr) throw new Error(`photographer: ${phErr.message}`);

  // 3) 포트폴리오 사진 6장 (placeholder)
  const RATIOS = [[800, 1000], [800, 1200], [800, 600], [800, 1340], [800, 800], [800, 900]];
  const photos = Array.from({ length: 6 }, (_, i) => {
    const [w, h] = RATIOS[i % RATIOS.length];
    return {
      photographer_id: ph.id,
      storage_path: `demo/${p.slug}/${i}.jpg`,
      src_url: `https://picsum.photos/seed/${p.slug}${i}/${w}/${h}`,
      thumb_url: `https://picsum.photos/seed/${p.slug}${i}/${w / 2}/${h / 2}`,
      width: w, height: h,
      mood_tags: p.moods,
      region: p.regions[0],
      visibility: "published",
      sort_order: i,
    };
  });
  const { data: insertedPhotos, error: phoErr } = await admin.from("photos").insert(photos).select("id");
  if (phoErr) throw new Error(`photos: ${phoErr.message}`);
  await admin.from("photographers").update({ hero_photo_id: insertedPhotos[0].id }).eq("id", ph.id);

  // 4) 패키지
  const pkgs = p.packages.map((k, i) => ({
    photographer_id: ph.id, name: k.name, price_krw: k.price,
    duration_min: k.dur, edited_count: k.edited, is_active: true, sort_order: i,
  }));
  const { error: pkgErr } = await admin.from("packages").insert(pkgs);
  if (pkgErr) throw new Error(`packages: ${pkgErr.message}`);

  // 5) 가능 시간 슬롯 (앞으로 4개 주말 오후)
  const slots = Array.from({ length: 4 }, (_, i) => {
    const start = new Date(Date.now() + (i + 1) * 3 * 864e5);
    start.setHours(14, 0, 0, 0);
    const end = new Date(start.getTime() + 2 * 3600e3);
    return { photographer_id: ph.id, start_at: start.toISOString(), end_at: end.toISOString(), is_booked: false };
  });
  const { error: avErr } = await admin.from("availability").insert(slots);
  if (avErr) throw new Error(`availability: ${avErr.message}`);

  console.log(`✅ 작가  ${email} (${p.name}) — 사진6 · 패키지2 · 슬롯4`);
}

async function createBuyer() {
  const email = "demo+qauser@samae.test";
  await resetUser(email);
  const { error } = await admin.auth.admin.createUser({
    email, password: PW, email_confirm: true, user_metadata: { name: "테스트 유저" },
  });
  if (error) throw new Error(`buyer: ${error.message}`);
  console.log(`✅ 유저  ${email} (테스트 유저)`);
}

(async () => {
  await createPhotographer(PHOTOGRAPHER);
  await createBuyer();
  console.log(`\n🎉 추가 완료 (비밀번호 공통: ${PW})`);
})().then(() => process.exit(0)).catch((e) => { console.error("❌", e.message); process.exit(1); });

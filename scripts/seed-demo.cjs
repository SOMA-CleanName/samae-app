// ════════════════════════════════════════════════════════════════
// 데모 공급 데이터 시드 (탐색용) — 프로덕션 DB
//
// 모든 데모 데이터는 식별 가능하게 태그된다:
//   · 작가 핸들 : demo_*
//   · auth 이메일 : demo+*@samae.test
// 정리는 `node scripts/unseed-demo.cjs` (데모 auth user 삭제 → 전부 cascade).
// 재실행 안전: 기존 데모를 먼저 정리하고 새로 삽입한다.
// ════════════════════════════════════════════════════════════════
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const { removeDemo } = require("./unseed-demo.cjs");

const t = fs.readFileSync(".env.local", "utf8");
const env = {};
for (const l of t.split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const PHOTOGRAPHERS = [
  {
    slug: "soyeon", name: "김소연", regions: ["성수", "한강"], moods: ["필름", "내추럴"],
    bio: "필름 카메라로 담는 자연스러운 데이트 스냅. 성수·한강 일대에서 촬영합니다.",
    packages: [
      { name: "데이트 스냅 베이직", price: 120000, dur: 60, edited: 15 },
      { name: "데이트 스냅 프리미엄", price: 190000, dur: 90, edited: 30 },
    ],
  },
  {
    slug: "jihoon", name: "박지훈", regions: ["연남", "성수"], moods: ["에디토리얼", "빈티지"],
    bio: "에디토리얼 무드의 인물 사진. 잡지 화보 같은 한 컷을 만들어 드려요.",
    packages: [
      { name: "프로필 촬영", price: 150000, dur: 60, edited: 10 },
      { name: "화보 패키지", price: 280000, dur: 120, edited: 40 },
    ],
  },
  {
    slug: "minji", name: "이민지", regions: ["제주", "한강"], moods: ["감성", "내추럴"],
    bio: "제주의 빛과 바다를 담는 감성 스냅. 여행·커플·가족 촬영 모두 환영합니다.",
    packages: [
      { name: "제주 여행 스냅", price: 200000, dur: 90, edited: 25 },
      { name: "반나절 동행 스냅", price: 350000, dur: 240, edited: 60 },
    ],
  },
  {
    slug: "hayoung", name: "최하영", regions: ["성수"], moods: ["빈티지", "필름"],
    bio: "빈티지 톤 필름 스냅 전문. 따뜻한 색감으로 오래 두고 볼 사진을 남겨요.",
    packages: [
      { name: "우정 스냅", price: 100000, dur: 45, edited: 12 },
      { name: "기념일 스냅", price: 170000, dur: 75, edited: 25 },
    ],
  },
];

const ms = (n) => `✅ ${n}`;

async function seed() {
  console.log("기존 데모 데이터 정리...");
  await removeDemo(admin);

  for (const p of PHOTOGRAPHERS) {
    // 1) auth user → profile(트리거)
    const email = `demo+${p.slug}@samae.test`;
    const { data: u, error: uErr } = await admin.auth.admin.createUser({
      email, password: "demo-pw-123456", email_confirm: true,
      user_metadata: { name: p.name },
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
    if (phErr) throw new Error(`photographer ${p.slug}: ${phErr.message}`);

    // 3) 포트폴리오 사진 (placeholder 이미지, published)
    // 핀터레스트식 비정형 그리드를 위해 사진마다 다른 비율을 부여
    const RATIOS = [
      [800, 1000], [800, 1200], [800, 600], [800, 1340],
      [800, 800], [800, 900], [800, 540], [800, 1100],
    ];
    const offset = p.slug.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    const photos = Array.from({ length: 6 }, (_, i) => {
      const seed = `${p.slug}${i}`;
      const [w, h] = RATIOS[(offset + i) % RATIOS.length];
      return {
        photographer_id: ph.id,
        storage_path: `demo/${p.slug}/${i}.jpg`,
        src_url: `https://picsum.photos/seed/${seed}/${w}/${h}`,
        thumb_url: `https://picsum.photos/seed/${seed}/${w / 2}/${h / 2}`,
        width: w, height: h,
        mood_tags: p.moods,
        region: p.regions[0],
        visibility: "published",
        sort_order: i,
      };
    });
    const { data: insertedPhotos, error: phoErr } = await admin.from("photos").insert(photos).select("id");
    if (phoErr) throw new Error(`photos ${p.slug}: ${phoErr.message}`);

    // 대표 사진
    await admin.from("photographers").update({ hero_photo_id: insertedPhotos[0].id }).eq("id", ph.id);

    // 4) 패키지
    const pkgs = p.packages.map((k, i) => ({
      photographer_id: ph.id, name: k.name, price_krw: k.price,
      duration_min: k.dur, edited_count: k.edited, is_active: true, sort_order: i,
    }));
    const { error: pkgErr } = await admin.from("packages").insert(pkgs);
    if (pkgErr) throw new Error(`packages ${p.slug}: ${pkgErr.message}`);

    // 5) 가능 시간 슬롯 (앞으로 4개 주말 오후)
    const slots = Array.from({ length: 4 }, (_, i) => {
      const start = new Date(Date.now() + (i + 1) * 3 * 864e5);
      start.setHours(14, 0, 0, 0);
      const end = new Date(start.getTime() + 2 * 3600e3);
      return {
        photographer_id: ph.id,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        is_booked: false,
      };
    });
    const { error: avErr } = await admin.from("availability").insert(slots);
    if (avErr) throw new Error(`availability ${p.slug}: ${avErr.message}`);

    console.log(ms(`@demo_${p.slug} (${p.name}) — 사진 6 · 패키지 ${pkgs.length} · 슬롯 4`));
  }

  // 데모 구매자 (이메일 로그인 즉시 가능 — 확인 완료 상태)
  const { error: bErr } = await admin.auth.admin.createUser({
    email: "demo+buyer@samae.test", password: "demo-pw-123456", email_confirm: true,
    user_metadata: { name: "데모 구매자" },
  });
  if (bErr) throw new Error(`buyer: ${bErr.message}`);
  console.log(ms("구매자 demo+buyer@samae.test (pw: demo-pw-123456)"));

  console.log(`\n🎉 데모 작가 ${PHOTOGRAPHERS.length}명 + 구매자 1명 시드 완료. http://localhost:3000 에서 확인하세요.`);
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch((e) => { console.error("❌", e.message); process.exit(1); });
}

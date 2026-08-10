// 취향 테스트 '목적' 축 감사 — 슬러그 해석과 실제 사진 성격을 대조한다. (docs/23)
//
//   node scripts/audit-taste-purposes.cjs
//
// 읽기 전용. 아무것도 쓰지 않는다.
//
// 재는 것 세 가지
//   1. taste-purposes.ts 의 슬러그가 explore_categories 에 실제로 있는가
//   2. 해석된 후보 사진이 '의도한 촬영 종류(타겟)' 와 얼마나 맞는가
//   3. 비공개 카테고리를 쓰고 있지는 않은가
//
// 슬러그 목록은 taste-purposes.ts 에서 직접 읽는다. 여기 하드코딩하면 원본이 바뀔 때
// 이 스크립트가 조용히 낡는다.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("❌ .env.local 에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  process.exit(1);
}

async function get(pathname) {
  const r = await fetch(`${URL_}/rest/v1/${pathname}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) throw new Error(`${r.status} ${pathname} — ${(await r.text()).slice(0, 120)}`);
  return r.json();
}

async function pageAll(pathname, page = 1000) {
  const out = [];
  for (let off = 0; ; off += page) {
    const sep = pathname.includes("?") ? "&" : "?";
    const chunk = await get(`${pathname}${sep}offset=${off}&limit=${page}`);
    out.push(...chunk);
    if (chunk.length < page) return out;
  }
}

// taste-purposes.ts 에서 { key, categorySlugs } 를 뽑는다.
function readPurposes() {
  const src = fs.readFileSync(path.join(ROOT, "src/lib/taste-purposes.ts"), "utf8");
  const out = [];
  const re = /key:\s*"([^"]+)"[\s\S]*?label:\s*"([^"]+)"[\s\S]*?categorySlugs:\s*\[([\s\S]*?)\]/g;
  let m;
  while ((m = re.exec(src))) {
    out.push({
      key: m[1],
      label: m[2],
      slugs: [...m[3].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
    });
  }
  if (out.length === 0) {
    console.error("❌ taste-purposes.ts 에서 목적을 읽지 못했습니다. 파일 구조가 바뀐 것 같습니다.");
    process.exit(1);
  }
  return out;
}

// 목적 key → 대응하는 타겟 카테고리 slug. 1:1 이 아니면 여기만 고치면 된다.
const PURPOSE_TO_TARGET = { wedding: "wedding", couple: "couple", personal: "snap" };

(async () => {
  const purposes = readPurposes();

  const exCats = await get("explore_categories?select=id,slug,title,published&limit=500");
  const bySlug = new Map(exCats.map((c) => [c.slug, c]));
  const exMem = await pageAll("explore_category_photos?select=category_id,photo_id");
  const exOf = new Map();
  for (const m of exMem) {
    if (!exOf.has(m.category_id)) exOf.set(m.category_id, new Set());
    exOf.get(m.category_id).add(m.photo_id);
  }

  // 타겟 멤버십 = 앨범 상속 ∪ 수동추가 − 제외 (target-categories.ts 와 같은 규칙)
  const tCats = await get("categories?select=id,slug,name");
  const published = new Set(
    (await pageAll("photos?select=id&visibility=eq.published")).map((p) => p.id)
  );
  const albums = await pageAll("albums?select=id,target_category_id");
  const albTarget = new Map(albums.filter((a) => a.target_category_id).map((a) => [a.id, a.target_category_id]));
  const photos = await pageAll("photos?select=id,album_id&visibility=eq.published");
  const target = new Map(tCats.map((c) => [c.id, new Set()]));
  for (const p of photos) {
    const t = albTarget.get(p.album_id);
    if (t && target.has(t)) target.get(t).add(p.id);
  }
  for (const o of await pageAll("target_category_photos?select=category_id,photo_id,excluded")) {
    if (!published.has(o.photo_id) || !target.has(o.category_id)) continue;
    if (o.excluded) target.get(o.category_id).delete(o.photo_id);
    else target.get(o.category_id).add(o.photo_id);
  }
  const targetBySlug = new Map(tCats.map((c) => [c.slug, target.get(c.id)]));

  console.log(`공개 사진 ${published.size}장 · 탐색 카테고리 ${exCats.length}개 · 타겟 ${tCats.length}개\n`);

  let problems = 0;
  for (const p of purposes) {
    const found = p.slugs.filter((s) => bySlug.has(s));
    const missing = p.slugs.filter((s) => !bySlug.has(s));
    const unpub = found.filter((s) => !bySlug.get(s).published);

    const cand = new Set();
    for (const s of found) for (const id of exOf.get(bySlug.get(s).id) ?? []) {
      if (published.has(id)) cand.add(id);
    }

    const tSlug = PURPOSE_TO_TARGET[p.key];
    const tSet = targetBySlug.get(tSlug) ?? new Set();
    let hit = 0;
    for (const id of cand) if (tSet.has(id)) hit++;
    const pct = cand.size ? (hit / cand.size) * 100 : 0;

    const flag = pct < 60 ? "  ⚠️" : "";
    console.log(`■ ${p.label} (key=${p.key} → 타겟 '${tSlug}')${flag}`);
    console.log(`   후보 ${cand.size}장 중 실제 ${tSlug} = ${hit}장  (${pct.toFixed(0)}%)`);
    console.log(`   ${tSlug} 전체 ${tSet.size}장 중 후보에 든 비율 ${tSet.size ? ((hit / tSet.size) * 100).toFixed(0) : 0}%`);
    if (missing.length) {
      console.log(`   ❌ 존재하지 않는 슬러그 ${missing.length}개: ${missing.join(", ")}`);
      problems++;
    }
    if (unpub.length) {
      console.log(`   ⚠️  비공개 카테고리 사용: ${unpub.join(", ")}`);
      problems++;
    }
    if (pct < 60) {
      const other = new Map();
      for (const id of cand) {
        if (tSet.has(id)) continue;
        for (const [s, set] of targetBySlug) if (set.has(id)) other.set(s, (other.get(s) ?? 0) + 1);
      }
      console.log(`   ❌ 정확도 60% 미만 — 나머지의 실제 타겟: ${[...other].map(([s, n]) => `${s} ${n}`).join(" · ")}`);
      problems++;
    }
    console.log("");
  }

  console.log(problems === 0 ? "✅ 문제 없음" : `발견된 문제 ${problems}건 — docs/23 참조`);
})().catch((e) => {
  console.error("실행 오류:", e.message);
  process.exit(1);
});

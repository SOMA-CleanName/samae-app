// 목적 세부분류 자동 초안 (0133, docs/39 §3).
//
// 매일 06:00 배치는 이 파일이 아니라 scripts/embed/purpose_drafts.py 를 돈다(같은 규칙을 파이썬으로 옮긴 것,
// docs/39 §7.4). 문장 · 경계값 · 규칙을 바꾸면 두 곳을 함께 바꾼다. 이 파일은 손으로 돌리는 도구로 남긴다.
//
// 포트폴리오마다, 그 포트폴리오의 목적 각각에 대해 세부분류를 고른다.
//   1. 글 먼저 — 제목·설명을 검색어 분리기(/search-query)에 넣어 나온 세부분류("이대 졸업 스냅" → 졸업).
//      목적 분류가 텍스트를 먼저 보는 것과 같은 원칙이다(docs/39 §6).
//   2. 글에 단서가 없으면 사진 — 그 목적의 세부분류마다 영어 설명 문장을 두고, 사진마다 가장 가까운
//      문장을 골라 포트폴리오 안 다수결.
// 쓰는 것은 apply_album_details_draft 뿐이다 — manual·예외 사진은 그 함수가 건드리지 않고, 초안은 auto 로
// 남아 어드민에서 검수한다.
//
// 사용:
//   node scripts/draft-purpose-details.cjs            미리보기 (DB 에 쓰지 않는다)
//   node scripts/draft-purpose-details.cjs --apply    초안 저장
//
// 검색어 분리기·임베딩은 PERSONA_EMBED_URL, 없으면 이 PC 의 127.0.0.1:8077.

const { Client } = require("pg");
const { readEnv, dbUrl } = require("./draft-personal-gender.cjs");

// 사진으로 고를 때 쓰는 문장. SigLIP 은 영어를 잘 읽는다. 키는 src/lib/purpose-details.json 과 같다.
const PROMPTS = {
  personal: {
    snap: "a candid outdoor snapshot of a person on the street",
    profile: "a studio profile portrait of a person",
    body_profile: "a fitness body profile photo showing a toned muscular body",
    id_photo: "a passport ID photo of a person on a plain background",
  },
  couple: {
    snap: "a couple walking together on a date",
    anniversary: "a marriage proposal with flowers and a ring",
  },
  friendship: {
    snap: "a group of friends posing together",
    siblings: "young siblings, brothers and sisters, posing together",
  },
  wedding: {
    ceremony: "a wedding ceremony in a wedding hall with guests",
    shoot: "a bride and groom posing for a pre-wedding photoshoot",
    remind: "a married couple celebrating their wedding anniversary",
  },
  pet: {
    dog: "a photo of a dog",
    cat: "a photo of a cat",
    other: "a photo of a small pet animal such as a rabbit or a bird",
  },
  commercial: {
    brand: "a brand advertising campaign photo",
    lookbook: "a fashion lookbook model wearing clothes",
    product: "a product photo on a clean background",
    business_profile: "a business headshot of a person in a suit",
    food_space: "food on a table or a restaurant interior",
  },
  event: {
    maternity: "a pregnant woman maternity photo",
    baby: "a newborn baby",
    first_birthday: "a baby's first birthday party with a traditional table",
    family: "a family portrait with parents and children",
    graduation: "a graduation photo with a gown and cap on campus",
    group: "a large group photo of many people",
    banquet: "a banquet or a birthday party celebration",
  },
};

// ── 개인 스냅 / 프로필 (2026-09-18 확정) ─────────────────────────────────
// 실내·실외는 기준이 아니다. **누가 봐도 프로필**일 때만 프로필이고, 애매하면 개인 스냅이다.
//   1. 설명에 "프로필" + 사진도 절반 이상 프로필 쪽  → 프로필
//   2. 설명에 "프로필" 이어도 사진이 누가 봐도 스냅(컨셉·자세 변화) → 개인 스냅   (모글 "개인 프로필 - 한지")
//   3. 설명에 "스냅"                                 → 개인 스냅            (규빈 "야외감성스냅")
//   4. 사진 90% 이상이 프로필 쪽 + 구도가 거의 반복(사진끼리 유사도 0.93↑) → 프로필
//   5. 나머지                                        → 개인 스냅
// 처음엔 "거리 스냅 vs 스튜디오 인물" 두 문장으로 갈라 표가 10/20·26/45 처럼 반반이었고, 검수에서
// 프로필 대부분이 스냅으로 고쳐졌다. 스튜디오여도 자세가 다양하면(태권도·컨셉 촬영) 스냅이다.
// 프로필 문장은 뚜렷하게(헤드샷·정면), 스냅 문장은 여럿 두고 가장 높은 점수를 써서 스냅을 세게 만든다.
const PROFILE_PROMPTS = [
  "a headshot portrait photo of a person, shoulders up, facing the camera",
  "a professional profile photo of a person looking straight at the camera",
  "an actor profile headshot with a simple background",
];
const SNAP_PROMPTS = [
  "a candid snapshot of a person in a scenic place",
  "a full-body photo of a person walking outside",
  "a person enjoying a natural moment, not looking at the camera",
  "a lifestyle snapshot of a person in a cafe or on the street",
  "a person posing in a field of flowers or by the sea",
  "a moody film snapshot of a person in a room",
];
const PROFILE_TEXT_SHARE = 0.5;
const PROFILE_IMAGE_SHARE = 0.9;
const PROFILE_REPEAT_SIMILARITY = 0.93;

/** 포트폴리오 사진이 프로필 쪽인 비율과, 사진끼리 얼마나 닮았나(구도·자세 반복). */
async function personalStats(client, albumId, vectors) {
  const cols = vectors.map((v, i) => `1 - (p.embedding <=> $${i + 2}::extensions.halfvec)`).join(", ");
  const { rows } = await client.query(`
    select array[${cols}] as s from public.photos p
     where p.album_id = $1 and p.visibility = 'published' and p.embedding is not null and not p.admin_purpose_overridden`,
    [albumId, ...vectors]);
  const margins = rows.map((row) => {
    const scores = row.s.map(Number);
    return Math.max(...scores.slice(0, PROFILE_PROMPTS.length)) - Math.max(...scores.slice(PROFILE_PROMPTS.length));
  });
  const { rows: [sim] } = await client.query(`
    with ph as (select id, embedding from public.photos
                 where album_id = $1 and visibility = 'published' and embedding is not null and not admin_purpose_overridden)
    select avg(1 - (x.embedding <=> y.embedding)) as s from ph x join ph y on x.id < y.id`, [albumId]);
  return {
    n: margins.length,
    share: margins.length ? margins.filter((m) => m > 0).length / margins.length : 0,
    similarity: sim?.s == null ? 0 : Number(sim.s),
  };
}

function choosePersonal(textDetails, text, stats) {
  const kept = textDetails.filter((detail) => detail !== "personal.profile");   // 바디프로필·증명은 글 그대로
  if (textDetails.includes("personal.profile")) {
    kept.push(stats.share >= PROFILE_TEXT_SHARE ? "personal.profile" : "personal.snap");
    return { details: kept, why: `글 프로필 · 사진 ${Math.round(stats.share * 100)}%` };
  }
  if (kept.length) return { details: kept, why: "글" };
  if (/스냅/.test(text)) return { details: ["personal.snap"], why: "글 스냅" };
  const obvious = stats.n >= 2 && stats.share >= PROFILE_IMAGE_SHARE && stats.similarity >= PROFILE_REPEAT_SIMILARITY;
  return {
    details: [obvious ? "personal.profile" : "personal.snap"],
    why: `사진 ${Math.round(stats.share * 100)}% · 반복 ${stats.similarity.toFixed(2)}`,
  };
}

function embedBase(env) {
  return (process.env.PERSONA_EMBED_URL || env.PERSONA_EMBED_URL || "http://127.0.0.1:8077").replace(/\/$/, "");
}

async function post(env, path, body) {
  const token = process.env.PERSONA_SERVICE_TOKEN || env.PERSONA_SERVICE_TOKEN;
  const response = await fetch(`${embedBase(env)}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-samae-token": token } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`임베딩 서버 ${path} ${response.status}`);
  return response.json();
}

/** 제목·설명에서 세부분류 단서. 검색어 분리기는 120자까지 받으므로 문장 단위로 나눠 넣는다. */
async function textDetails(env, text) {
  const found = new Set();
  const pieces = (text || "").split(/[\n.!?·,]+/).map((piece) => piece.trim()).filter(Boolean);
  for (const piece of pieces) {
    for (let at = 0; at < piece.length; at += 100) {
      const parsed = await post(env, "/search-query", { query: piece.slice(at, at + 100) });
      for (const detail of parsed.details ?? []) found.add(detail);
    }
  }
  return found;
}

async function run(client, env, { apply }) {
  // 문장 벡터 — 목적마다
  const promptVectors = {};
  for (const [purpose, prompts] of Object.entries(PROMPTS)) {
    const keys = Object.keys(prompts);
    const { vectors } = await post(env, "/embed-text", { texts: keys.map((key) => prompts[key]) });
    promptVectors[purpose] = keys.map((key, i) => ({ detail: `${purpose}.${key}`, vector: JSON.stringify(vectors[i]) }));
  }

  // /embed-text 는 한 번에 8문장까지 받는다
  const personalVectors = [];
  for (const texts of [PROFILE_PROMPTS, SNAP_PROMPTS]) {
    const { vectors } = await post(env, "/embed-text", { texts });
    personalVectors.push(...vectors.map((vector) => JSON.stringify(vector)));
  }

  const { rows: albums } = await client.query(`
    select a.id, a.admin_purposes, a.admin_purpose_details_source as source,
           coalesce(nullif(btrim(a.title), ''), '제목 없음') as title, coalesce(a.description, '') as description,
           coalesce(ph.display_name, '이름 없는 작가') as photographer
      from public.albums a
      left join public.photographers ph on ph.id = a.photographer_id
     where cardinality(a.admin_purposes) > 0
       and exists (select 1 from public.photos p where p.album_id = a.id and p.visibility = 'published')
     order by a.created_at desc`);

  const plan = [];
  for (const album of albums) {
    if (album.source === "manual") continue;
    const fromText = await textDetails(env, `${album.title}\n${album.description}`);
    const details = [];
    const why = [];
    for (const purpose of album.admin_purposes) {
      const own = [...fromText].filter((detail) => detail.startsWith(`${purpose}.`));
      if (purpose === "personal") {
        const stats = await personalStats(client, album.id, personalVectors);
        const chosen = choosePersonal(own, `${album.title}\n${album.description}`, stats);
        details.push(...chosen.details);
        why.push(`personal: ${chosen.why}`);
        continue;
      }
      if (own.length) {
        details.push(...own);
        why.push(`${purpose}: 글`);
        continue;
      }
      const candidates = promptVectors[purpose];
      if (!candidates) continue;
      // 사진마다 가장 가까운 문장 → 다수결
      const distances = candidates.map((c, i) => `(p.embedding <=> $${i + 2}::extensions.halfvec)`);
      const { rows } = await client.query(`
        select array[${distances.join(", ")}] as d
          from public.photos p
         where p.album_id = $1 and p.visibility = 'published' and p.embedding is not null
           and not p.admin_purpose_overridden`,
        [album.id, ...candidates.map((c) => c.vector)]);
      if (!rows.length) continue;
      const votes = new Map();
      for (const row of rows) {
        const best = row.d.indexOf(Math.min(...row.d));
        votes.set(best, (votes.get(best) ?? 0) + 1);
      }
      const [winner, count] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
      details.push(candidates[winner].detail);
      why.push(`${purpose}: 사진 ${count}/${rows.length}`);
    }
    if (details.length) plan.push({ ...album, details: [...new Set(details)], why });
  }

  const tally = new Map();
  for (const item of plan) for (const detail of item.details) tally.set(detail, (tally.get(detail) ?? 0) + 1);
  console.log(`초안 대상 포트폴리오 ${plan.length}개 (사람이 정한 것은 건너뜀)`);
  for (const [purpose, prompts] of Object.entries(PROMPTS)) {
    const line = Object.keys(prompts).map((key) => `${key} ${tally.get(`${purpose}.${key}`) ?? 0}`).join(" · ");
    console.log(`  ${purpose.padEnd(11)} ${line}`);
  }
  const profiles = plan.filter((p) => p.details.includes("personal.profile"));
  console.log(`\n개인 프로필 ${profiles.length}개`);
  for (const item of profiles) {
    console.log(`  ${item.photographer} — ${item.description.replace(/\s+/g, " ").slice(0, 40)}  (${item.why.join(", ")})`);
  }
  console.log("\n글로 정한 것");
  for (const item of plan.filter((p) => p.why.some((w) => w.endsWith("글")))) {
    console.log(`  ${item.details.join(", ")}  ← ${item.photographer} — ${item.description.replace(/\s+/g, " ").slice(0, 50)}`);
  }

  if (!apply) {
    console.log("\n미리보기입니다. 저장하려면 --apply");
    return { plan, albums: 0, photos: 0 };
  }
  let saved = 0, photos = 0;
  for (const item of plan) {
    const { rows: [r] } = await client.query("select public.apply_album_details_draft($1, $2) as n", [item.id, item.details]);
    saved += 1; photos += r.n;
  }
  console.log(`\n저장: 포트폴리오 ${saved}개 · 사진 ${photos}장 (auto — 어드민에서 검수)`);
  return { plan, albums: saved, photos };
}

async function main() {
  const env = readEnv();
  const client = new Client({ connectionString: dbUrl(env), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await run(client, env, { apply: process.argv.includes("--apply") });
  } finally {
    await client.end();
  }
}

module.exports = { run, PROMPTS, choosePersonal };

if (require.main === module) {
  main().catch((error) => {
    console.error("❌", error.message);
    process.exit(1);
  });
}

// 개인 포트폴리오의 성별 자동 초안 — 여자·남자 중 어느 쪽에 가까운지로 (docs/29 §12.9, 0132).
//
// 매일 06:00 배치는 이 파일이 아니라 scripts/embed/purpose_drafts.py 를 돈다(같은 규칙을 파이썬으로 옮긴 것,
// docs/39 §7.4). 문장 · 경계값 · 규칙을 바꾸면 두 곳을 함께 바꾼다. 이 파일은 손으로 돌리는 도구로 남긴다.
//
// 사진마다 "여자"·"남자" 텍스트 벡터와의 거리를 비교해 여자/남자를 가르고, 포트폴리오 안 다수결로
// 포트폴리오 성별을 정한다. 쓰는 것은 apply_album_gender_draft 뿐이다 — 사람이 정한 성별과 예외
// 사진은 그 함수가 건드리지 않고, 초안은 auto 로 남아 어드민에서 검수한다.
//
// 사용:
//   node scripts/draft-personal-gender.cjs            미리보기 (DB 에 쓰지 않는다)
//   node scripts/draft-personal-gender.cjs --apply    초안 저장
//
// 벡터는 임베딩 서버에서 받는다 — PERSONA_EMBED_URL, 없으면 이 PC 의 127.0.0.1:8077.

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

// siglip-text-search-core.ts 의 GENDER_BOUNDARY 와 같다. 남자까지 거리 − 여자까지 거리가 이보다 작으면 남자.
const GENDER_BOUNDARY = 0.005;
// 소수 쪽이 이만큼 넘으면 섞인 포트폴리오로 따로 보여준다 — 초안은 넣되 검수할 때 먼저 볼 것.
const MIXED_SHARE = 0.2;

function readEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function dbUrl(env) {
  const direct = process.env.SUPABASE_DB_URL || env.SUPABASE_DB_URL;
  if (!direct) throw new Error("SUPABASE_DB_URL 을 찾지 못했습니다.");
  const u = new URL(direct);
  const ref = u.hostname.match(/^db\.([a-z0-9]+)\./)?.[1];
  if (!ref) return direct;
  // 직접 연결은 IPv6 전용이라 Session pooler 로 돌린다(docs/22 §11).
  return `postgresql://${encodeURIComponent("postgres." + ref)}:${u.password}`
    + "@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres";
}

async function embed(env, text) {
  const base = (process.env.PERSONA_EMBED_URL || env.PERSONA_EMBED_URL || "http://127.0.0.1:8077").replace(/\/$/, "");
  const token = process.env.PERSONA_SERVICE_TOKEN || env.PERSONA_SERVICE_TOKEN;
  const response = await fetch(`${base}/embed-text`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-samae-token": token } : {}) },
    body: JSON.stringify({ texts: [text] }),
  });
  if (!response.ok) throw new Error(`임베딩 서버 ${response.status} — ${base}`);
  const { vectors } = await response.json();
  if (!Array.isArray(vectors?.[0]) || vectors[0].length !== 1152) throw new Error("1152차원 벡터가 아닙니다");
  return JSON.stringify(vectors[0]);
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

/** 연결을 받아 돈다 — 롤백 트랜잭션 안에서 시험할 수 있게. */
async function run(client, env, { apply }) {
  const [female, male] = [await embed(env, "여자"), await embed(env, "남자")];

  // 개인 포트폴리오의, 예외가 아닌 공개 사진만 센다 — 초안이 실제로 들어갈 사진들이다.
  const { rows } = await client.query(`
    select a.id, coalesce(nullif(btrim(a.title), ''), '제목 없음') as title,
           coalesce(ph.display_name, '이름 없는 작가') as photographer,
           a.admin_purpose_gender as current, a.admin_purpose_gender_source as current_source,
           count(*) filter (where (p.embedding <=> $2::extensions.halfvec) - (p.embedding <=> $1::extensions.halfvec) >= $3) as female,
           count(*) filter (where (p.embedding <=> $2::extensions.halfvec) - (p.embedding <=> $1::extensions.halfvec) <  $3) as male
      from public.albums a
      join public.photos p on p.album_id = a.id
      left join public.photographers ph on ph.id = p.photographer_id
     where 'personal' = any(a.admin_purposes)
       and 'personal' = any(p.admin_purposes)
       and not p.admin_purpose_overridden
       and p.visibility = 'published'
       and p.embedding is not null
     group by a.id, a.title, ph.display_name, a.admin_purpose_gender, a.admin_purpose_gender_source
     order by male desc, a.id`, [female, male, GENDER_BOUNDARY]);

  const plan = rows.map((row) => {
    const f = Number(row.female), m = Number(row.male);
    const gender = f === m ? null : f > m ? "female" : "male";
    const minority = Math.min(f, m) / (f + m);
    return { ...row, f, m, gender, mixed: minority >= MIXED_SHARE };
  });
  const manual = plan.filter((p) => p.current_source === "manual");
  const todo = plan.filter((p) => p.current_source !== "manual" && p.gender);
  const ties = plan.filter((p) => p.current_source !== "manual" && !p.gender);

  const standalone = await client.query(`
    select count(*) n from public.photos
     where album_id is null and 'personal' = any(admin_purposes) and visibility = 'published'`);

  console.log(`개인 포트폴리오 ${plan.length}개 — 사람이 정한 것 ${manual.length}개는 건너뜀`);
  console.log(`초안 대상 ${todo.length}개: 여성 ${todo.filter((p) => p.gender === "female").length} · 남성 ${todo.filter((p) => p.gender === "male").length}`);
  console.log(`  동수라 정하지 않음 ${ties.length}개 · 포트폴리오 없는 개인 사진 ${standalone.rows[0].n}장(어드민에서 직접)`);
  const show = (label, list) => {
    if (!list.length) return;
    console.log(`\n${label}`);
    for (const p of list) console.log(`  ${p.gender === "male" ? "남" : p.gender === "female" ? "여" : "?"}  여${p.f}·남${p.m}  ${p.photographer} — ${p.title}  (${p.id})`);
  };
  show("남성으로 잡힌 포트폴리오 — 검수 때 먼저 볼 것", todo.filter((p) => p.gender === "male"));
  show("성별이 섞인 포트폴리오 — 사진 예외가 필요할 수 있음", todo.filter((p) => p.mixed));
  show("동수", ties);

  if (!apply) {
    console.log("\n미리보기입니다. 저장하려면 --apply");
    return { albums: 0, photos: 0 };
  }

  let albums = 0, photos = 0;
  for (const p of todo) {
    const { rows: [r] } = await client.query("select public.apply_album_gender_draft($1, $2) as n", [p.id, p.gender]);
    if (r.n > 0) { albums += 1; photos += r.n; }
  }
  console.log(`\n저장: 포트폴리오 ${albums}개 · 사진 ${photos}장 (auto — 어드민에서 검수)`);
  return { albums, photos };
}

module.exports = { run, readEnv, dbUrl };

if (require.main === module) {
  main().catch((error) => {
    console.error("❌", error.message);
    process.exit(1);
  });
}

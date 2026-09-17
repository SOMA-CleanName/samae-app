// Default: read-only report. --apply saves unique same-owner matches for admins only.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { parseEnv } = require("node:util");

function planPackageLinks(albums, packages) {
  const byOwner = new Map();
  for (const item of packages) {
    const owned = byOwner.get(item.photographer_id) ?? [];
    owned.push(item);
    byOwner.set(item.photographer_id, owned);
  }
  return albums.map((album) => {
    const available_packages = byOwner.get(album.photographer_id) ?? [];
    const price = album.photo_prices.length === 1 ? album.photo_prices[0] : null;
    const matching_packages = price === null ? [] : available_packages.filter((item) => item.price_krw === price);
    let reason;
    if (album.package_id !== null) reason = "already_linked";
    else if (album.admin_package_id != null) reason = "already_internal";
    else if (album.photo_count === 0) reason = "no_photos";
    else if (album.priced_photo_count === 0) reason = "no_price";
    else if (album.priced_photo_count !== album.photo_count || album.photo_prices.length !== 1) reason = "inconsistent_photo_prices";
    else if (album.price_krw !== null && album.price_krw !== price) reason = "album_photo_price_conflict";
    else if (matching_packages.length === 0) reason = "no_matching_package";
    else if (matching_packages.length > 1) reason = "ambiguous_price";
    else reason = "matched";
    return {
      ...album, reason, available_packages, matching_packages,
      target_package_id: reason === "matched" ? matching_packages[0].id : null,
      target_price_krw: reason === "matched" ? price : null,
    };
  });
}

async function readPlan(client) {
  const albums = (await client.query(`
    select a.id,a.photographer_id,ph.display_name as photographer_name,a.title,a.created_at,
      a.package_id,a.price_krw,a.admin_purposes,ap.package_id as admin_package_id,
      count(p.id)::int as photo_count,count(p.price_krw)::int as priced_photo_count,
      coalesce(jsonb_agg(distinct p.price_krw) filter(where p.price_krw is not null),'[]') as photo_prices,
      coalesce(bool_or(p.visibility='published'),false) as has_published_photos
    from public.albums a
    join public.photographers ph on ph.id=a.photographer_id
    left join public.album_admin_packages ap on ap.album_id=a.id
    left join public.photos p on p.album_id=a.id
    group by a.id,ph.display_name,ap.package_id order by a.id
  `)).rows;
  const packages = (await client.query(`
    select id,photographer_id,name,price_krw,is_active
    from public.packages order by photographer_id,sort_order,id
  `)).rows;
  return planPackageLinks(albums, packages);
}

async function fingerprints(client) {
  const output = {};
  for (const table of ["albums", "photos", "packages"]) {
    // Internal assignments must not alter any author data, even update timestamps.
    output[table] = (await client.query(`
      select count(*)::int as rows,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by id),'')) as hash
      from public.${table} t
    `)).rows[0];
  }
  return output;
}

function summarize(plan) {
  const result = { portfolios: plan.length, matched: 0, matchedPublished: 0, matchedPhotos: 0, reasons: {} };
  for (const item of plan) {
    result.reasons[item.reason] = (result.reasons[item.reason] ?? 0) + 1;
    if (item.reason === "matched") {
      result.matched++;
      result.matchedPublished += Number(item.has_published_photos);
      result.matchedPhotos += item.photo_count;
    }
  }
  return result;
}

function writeReport(directory, plan, summary, status) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "report.json"), JSON.stringify({
    generated_at: new Date().toISOString(), assignmentScope: "admin_internal", status, summary, portfolios: plan,
  }, null, 2));
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const header = ["album_id", "photographer", "title", "published", "reason", "photo_prices", "purpose", "matching_packages", "available_packages"];
  const csv = [header, ...plan.filter((item) => !["matched", "already_linked", "already_internal"].includes(item.reason)).map((item) => [
    item.id, item.photographer_name, item.title, item.has_published_photos, item.reason,
    item.photo_prices.join(" / "), item.admin_purposes.join(" / "),
    item.matching_packages.map((p) => `${p.name} (${p.price_krw})`).join(" / "),
    item.available_packages.map((p) => `${p.name} (${p.price_krw})`).join(" / "),
  ])].map((row) => row.map(quote).join(",")).join("\r\n");
  fs.writeFileSync(path.join(directory, "needs-review.csv"), "\uFEFF" + csv);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply")) throw new Error("Usage: node scripts/backfill-portfolio-packages.cjs [--apply]");
  const apply = args.includes("--apply");
  const root = path.resolve(__dirname, "..");
  const env = { ...parseEnv(fs.readFileSync(path.join(root, ".env.local"), "utf8")), ...process.env };
  const connectionString = env.SUPABASE_DB_POOLER_URL || env.SUPABASE_DB_URL;
  const url = new URL(connectionString);
  const project = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const directMatch = url.hostname === `db.${project}.supabase.co`;
  const poolerMatch = url.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(url.username) === `postgres.${project}`;
  assert.ok(directMatch || poolerMatch, "SQL connection must match the app Supabase project");
  const directory = path.join(root, "scripts", "embed", "out", "package-links", `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${apply ? "apply" : "preview"}`);
  const { Client } = require("pg");
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000, query_timeout: 30000 });
  let committed = false;
  await client.connect();
  try {
    await client.query(apply ? "begin isolation level serializable" : "begin isolation level repeatable read read only");
    await client.query("set local lock_timeout='5s'; set local statement_timeout='25s'; set local idle_in_transaction_session_timeout='30s'");
    if (apply) {
      // A short transaction prevents prices or existing links changing between comparison and update.
      await client.query("lock table public.albums in share row exclusive mode");
      await client.query("lock table public.album_admin_packages in share row exclusive mode");
      await client.query("lock table public.photos,public.packages in share mode");
    }
    const plan = await readPlan(client);
    const summary = summarize(plan);
    writeReport(directory, plan, summary, "preview");
    if (!apply) {
      await client.query("rollback");
      console.log(JSON.stringify({ mode: "preview", summary, report: directory }));
      return;
    }
    const before = await fingerprints(client);
    const links = plan.filter((item) => item.reason === "matched").map((item) => ({
      album_id: item.id, package_id: item.target_package_id,
    }));
    const changed = await client.query(`
      insert into public.album_admin_packages(album_id,package_id)
      select album_id,package_id from jsonb_to_recordset($1::jsonb) as c(album_id uuid,package_id uuid)
      returning album_id
    `, [JSON.stringify(links)]);
    assert.equal(changed.rowCount, links.length, "Every planned link must apply exactly once");
    const afterPlan = await readPlan(client);
    const afterById = new Map(afterPlan.map((item) => [item.id, item]));
    for (const item of plan) {
      const saved = afterById.get(item.id);
      assert.equal(saved.package_id, item.package_id);
      assert.equal(saved.price_krw, item.price_krw);
      assert.equal(saved.admin_package_id, item.reason === "matched" ? item.target_package_id : item.admin_package_id);
      if (item.reason === "matched") {
        const owned = saved.available_packages.find((p) => p.id === saved.admin_package_id);
        assert.ok(owned && owned.price_krw === item.target_price_krw, "Internal package owner and price must match");
      }
    }
    assert.deepEqual(await fingerprints(client), before, "Photo data, purpose/review metadata, and registered packages must stay unchanged");
    writeReport(directory, plan, summary, "verified_pending_commit");
    await client.query("commit");
    committed = true;
    writeReport(directory, plan, summary, "committed");
    console.log(JSON.stringify({ mode: "apply", committed, summary, dataPreserved: true, report: directory }));
  } catch (error) {
    if (!committed) await client.query("rollback").catch(() => {});
    console.error(JSON.stringify({ failed: true, committed, code: error.code || error.name }));
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

module.exports = { planPackageLinks };
if (require.main === module) main().catch((error) => {
  console.error(JSON.stringify({ failed: true, code: error.code || error.name }));
  process.exitCode = 1;
});

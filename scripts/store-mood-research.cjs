// Explicit --apply only. Writes exclusively to new mood research tables.
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { Client } = require('pg');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'scripts/embed/out/mood-vocabulary');
async function batch(client, rows, sql) {
  for (let i = 0; i < rows.length; i += 1000) await client.query(sql, [JSON.stringify(rows.slice(i, i + 1000))]);
}
async function main() {
  const mode = process.argv[2];
  if (!['collection', 'validation', 'classification'].includes(mode) || !process.argv.includes('--apply')) {
    throw new Error('Usage: node scripts/store-mood-research.cjs collection|validation|classification --apply');
  }
  const data = JSON.parse(fs.readFileSync(path.join(OUT, `${mode}.json`), 'utf8'));
  const env = parseEnv(fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8'));
  const url = new URL(env.SUPABASE_DB_POOLER_URL || env.SUPABASE_DB_URL);
  const project = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  if (!(url.hostname === `db.${project}.supabase.co` ||
      (url.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(url.username) === `postgres.${project}`))) {
    throw new Error('Database project mismatch');
  }
  const client = new Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("set local lock_timeout='5s'; set local statement_timeout='60s'");
    await client.query("select pg_advisory_xact_lock(hashtext('samae-mood-research'))");
    const migration = '0119_mood_vocabulary_research.sql';
    const exists = await client.query('select name from public._migrations where name=$1', [migration]);
    if (!exists.rowCount) {
      await client.query(fs.readFileSync(path.join(ROOT, 'supabase/migrations', migration), 'utf8'));
      await client.query('insert into public._migrations(name) values($1)', [migration]);
      await client.query("notify pgrst,'reload schema'");
    }
    if (mode === 'collection') {
      await batch(client, data.sources, `insert into public.mood_sources(id,url,revision,license_status,attribution,metadata)
        select id,url,revision,license_status,attribution,metadata from jsonb_to_recordset($1::jsonb)
        as x(id text,url text,revision text,license_status text,attribution text,metadata jsonb)
        on conflict(id) do nothing`);
      await batch(client, data.candidates, `insert into public.mood_candidates(id,label,axis,english_prompt,selection_status,selection_basis)
        select id,label,axis,english_prompt,selection_status,selection_basis from jsonb_to_recordset($1::jsonb)
        as x(id text,label text,axis text,english_prompt text,selection_status text,selection_basis text)
        on conflict(id) do nothing`);
      await batch(client, data.entries, `insert into public.mood_candidate_sources(source_id,entry_key,candidate_id,metadata)
        select source_id,entry_key,candidate_id,metadata from jsonb_to_recordset($1::jsonb)
        as x(source_id text,entry_key text,candidate_id text,metadata jsonb)
        on conflict(source_id,entry_key) do nothing`);
    } else if (mode === 'classification') {
      const name = '0120_mood_lexical_classification.sql';
      if (!(await client.query('select name from public._migrations where name=$1', [name])).rowCount) {
        await client.query(fs.readFileSync(path.join(ROOT, 'supabase/migrations', name), 'utf8'));
        await client.query('insert into public._migrations(name) values($1)', [name]);
        await client.query("notify pgrst,'reload schema'");
      }
      // No edits to candidate axes, selection status, prompts, sources, or photos.
      await batch(client, data.rows, `insert into public.mood_candidate_classifications(candidate_id,kind,axis,version,rule,evidence)
        select candidate_id,kind,axis,version,rule,evidence from jsonb_to_recordset($1::jsonb)
        as x(candidate_id text,kind text,axis text,version text,rule text,evidence jsonb)
        on conflict(candidate_id) do update set kind=excluded.kind,axis=excluded.axis,version=excluded.version,
        rule=excluded.rule,evidence=excluded.evidence,classified_at=now()
        where mood_candidate_classifications.version is distinct from excluded.version
           or mood_candidate_classifications.evidence is distinct from excluded.evidence
           or mood_candidate_classifications.kind is distinct from excluded.kind
           or mood_candidate_classifications.axis is distinct from excluded.axis
           or mood_candidate_classifications.rule is distinct from excluded.rule`);
    } else {
      const r = data.run;
      await client.query(`insert into public.mood_validation_runs(id,model,candidate_count,photo_count,metadata)
        values($1,$2,$3,$4,$5) on conflict(id) do nothing`, [r.id,r.model,r.candidate_count,r.photo_count,r.metadata]);
      await batch(client, data.results, `insert into public.mood_validation_results(run_id,candidate_id,photo_id,rank,cosine)
        select run_id,candidate_id,photo_id,rank,cosine from jsonb_to_recordset($1::jsonb)
        as x(run_id text,candidate_id text,photo_id uuid,rank integer,cosine double precision)
        on conflict(run_id,candidate_id,photo_id) do nothing`);
    }
    const counts = (await client.query(`select
      (select count(*) from public.mood_candidates)::int as candidates,
      (select count(*) from public.mood_candidates where selection_status='shortlisted')::int as shortlisted,
      (select count(*) from public.mood_candidate_sources)::int as source_entries,
      (select count(*) from public.mood_validation_results)::int as validation_pairs`)).rows[0];
    for (const role of ['anon', 'authenticated']) {
      const denied = await client.query(`select has_table_privilege($1,'public.mood_candidates','select') as allowed`, [role]);
      if (denied.rows[0].allowed) throw new Error('Research table must remain private');
    }
    await client.query('commit');
    console.log(JSON.stringify({ committed: true, mode, ...counts }));
  } catch (e) { await client.query('rollback'); throw e; }
  finally { await client.end(); }
}
main().catch(error => { console.error(JSON.stringify({ failed: true, code: error.code || error.name })); process.exitCode = 1; });

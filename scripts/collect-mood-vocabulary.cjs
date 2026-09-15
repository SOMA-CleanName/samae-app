// Public inventories + explicitly editorial photo-mood pilot. No claimed usage frequency.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'scripts/embed/out/mood-vocabulary');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const normalize = value => value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
const candidateId = (label, axis) => hash(JSON.stringify([normalize(label), axis]));

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Public source HTTP ${response.status}`);
  return response;
}

function inventory() {
  const candidates = new Map();
  const entries = new Map();
  const sources = [];
  function add(sourceId, entryKey, label, axis = 'unassigned', metadata = {}, prompt = null) {
    label = normalize(label);
    if (!label) throw new Error('Empty candidate');
    const id = candidateId(label, axis);
    if (!candidates.has(id)) candidates.set(id, {
      id, label, axis, english_prompt: prompt,
      selection_status: prompt ? 'shortlisted' : 'collected',
      selection_basis: prompt ? 'editorial_photo_mood_pilot_not_measured_popularity' : 'source_inventory_not_usage_frequency',
    });
    entries.set(JSON.stringify([sourceId, String(entryKey)]), {
      source_id: sourceId, entry_key: String(entryKey), candidate_id: id, metadata,
    });
  }
  return { sources, candidates, entries, add };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const data = inventory();
  const repo = 'spellcheck-ko/korean-dict-nikl';
  const tree = await (await get(`https://api.github.com/repos/${repo}/git/trees/master?recursive=1`)).json();
  if (tree.truncated || !tree.sha) throw new Error('Incomplete dictionary tree');
  const files = tree.tree.filter(x => /^krdict\/\d+\.xml$/.test(x.path));
  if (!files.length) throw new Error('Missing dictionary files');
  const sourceId = `krdict-mirror:${tree.sha}`;
  const source = { id: sourceId, url: `https://github.com/${repo}/tree/${tree.sha}/krdict`,
    revision: tree.sha, license_status: 'CC-BY-SA-2.0-KR; headwords and lexical metadata only',
    attribution: 'National Institute of Korean Language; redistribution by spellcheck-ko (unofficial mirror)',
    metadata: { coverage: 'all krdict XML files in pinned mirror; not all Korean dictionaries', files: [] } };
  data.sources.push(source);
  // Cache exact revision; serial files keep memory/network bounded and make progress visible.
  for (const file of files) {
    const cached = path.join(OUT, `${tree.sha}-${path.basename(file.path)}`);
    if (!fs.existsSync(cached)) {
      const bytes = Buffer.from(await (await get(`https://raw.githubusercontent.com/${repo}/${tree.sha}/${file.path}`)).arrayBuffer());
      if (bytes.length !== file.size) throw new Error('Dictionary size mismatch');
      fs.writeFileSync(cached, bytes);
    }
    const bytes = fs.readFileSync(cached);
    if (bytes.length !== file.size) throw new Error('Cached dictionary size mismatch');
    const blob = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (blob !== file.sha) throw new Error('Dictionary Git blob checksum mismatch');
    const parsed = spawnSync(process.env.PYTHON || 'python', [path.join(ROOT, 'scripts/embed/extract_mood_dictionary.py'), cached],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (parsed.status !== 0) throw new Error('Dictionary XML parser failed');
    if (parsed.stderr) process.stdout.write(parsed.stderr);
    const rows = JSON.parse(parsed.stdout);
    for (const row of rows) data.add(sourceId, row.entry_key, row.label, 'unassigned', row.metadata);
    source.metadata.files.push({ path: file.path, sha256: hash(bytes), entries: rows.length });
    console.log(`Dictionary ${file.path}: ${rows.length} entries`);
  }
  const knuRepo = 'park1200656/KnuSentiLex';
  const knuTree = await (await get(`https://api.github.com/repos/${knuRepo}/git/trees/master?recursive=1`)).json();
  if (!knuTree.sha || knuTree.truncated) throw new Error('Incomplete sentiment tree');
  const knuBytes = Buffer.from(await (await get(`https://raw.githubusercontent.com/${knuRepo}/${knuTree.sha}/data/SentiWord_info.json`)).arrayBuffer());
  const knu = JSON.parse(knuBytes);
  const knuId = `knu:${knuTree.sha}`;
  data.sources.push({ id: knuId, url: `https://github.com/${knuRepo}/tree/${knuTree.sha}`, revision: knuTree.sha,
    license_status: 'explicit redistribution license not located; internal research inventory, not published tags',
    attribution: 'KNU Korean Sentiment Lexicon: Byung-Won On, Sang-Min Park, Chul-Won Na',
    metadata: { entries: knu.length, sha256: hash(knuBytes), coverage: 'entire data/SentiWord_info.json; sentiment is not photo mood' } });
  knu.forEach((row, index) => data.add(knuId, index, row.word, 'unassigned', { polarity: row.polarity, word_root: row.word_root }));
  const seed = fs.readFileSync(path.join(ROOT, 'scripts/embed/mood_seed.tsv'), 'utf8');
  const seedId = `editorial:${hash(seed)}`;
  data.sources.push({ id: seedId, url: 'repo:scripts/embed/mood_seed.tsv', revision: hash(seed),
    license_status: 'project-authored vocabulary and prompts', attribution: 'Samae editorial/AI-assisted pilot',
    metadata: { usage_frequency_available: false, human_validation: 'pending', coverage: '140 pilot concepts, not an exhaustive mood inventory' } });
  const seedRows = seed.trim().split(/\r?\n/).slice(1);
  seedRows.forEach((line, i) => {
    const [axis, label, description] = line.split('\t');
    if (!axis || !label || !description) throw new Error('Invalid seed TSV');
    data.add(seedId, i, label, axis, { selection: 'editorial', description }, `A photograph with ${description}.`);
  });
  if (seedRows.length < 100 || seedRows.length > 200) throw new Error('Pilot must contain 100–200 concepts');
  const output = { collected_at: new Date().toISOString(), sources: data.sources,
    candidates: [...data.candidates.values()], entries: [...data.entries.values()],
    unavailable_sources: ['Direct official dictionary API (key not configured by this collector)', 'Full Urimalsaem/Standard dictionary (not collected in this pass)'] };
  fs.writeFileSync(path.join(OUT, 'collection.json'), JSON.stringify(output));
  console.log(JSON.stringify({ sources: output.sources.length, candidates: output.candidates.length, entries: output.entries.length,
    shortlisted: output.candidates.filter(x => x.selection_status === 'shortlisted').length, output: path.join(OUT, 'collection.json') }));
}
module.exports = { normalize, candidateId, inventory };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

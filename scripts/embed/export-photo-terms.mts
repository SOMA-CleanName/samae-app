// 사진 무드 표현 뼈대를 파일로 내보낸다(docs/40 §17-5) — 어드민 화면과 같은 재료 · 같은 규칙(mood-photo-terms.ts).
// DB 는 작가 태그를 읽기만 한다. 키는 .env.local 에서 읽고 어디에도 찍지 않는다.
//   npx tsx scripts/embed/export-photo-terms.mts  →  scripts/embed/out/mood-vocabulary/photo-terms.jsonl
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { mergePhotoTerms, type PhotoTermAxes, type PhotoTermEdit, type PhotoTermMerge } from "../../src/lib/mood-photo-terms";
import { summarizeAuthorTags, normTag } from "../../src/lib/mood-author-tags";
import type { Addition } from "../../src/lib/mood-additions";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const EMBED = path.join(ROOT, "scripts", "embed");
const env: Record<string, string> = {};
for (const line of readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (line && !line.startsWith("#") && i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const jsonl = <T,>(p: string): T[] => {
  try { return readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as T); } catch { return []; }
};

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const photos: { photographer_id: string | null; mood_tags: string[] | null }[] = [];
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await sb.from("photos").select("photographer_id,visibility,mood_tags").neq("visibility", "archived").order("id").range(offset, offset + 999);
  if (error) throw error;
  photos.push(...(data ?? []));
  if ((data?.length ?? 0) < 1000) break;
}
const { data: profiles, error } = await sb.from("photographers").select("id,mood_tags");
if (error) throw error;

const screen = JSON.parse(readFileSync(path.join(EMBED, "mood-screen-list.json"), "utf8")) as { words: { w: string; alt?: string[]; axes: string[] }[] };
const screenAxes = new Map<string, string[]>();
for (const word of screen.words) for (const w of [word.w, ...(word.alt ?? [])]) screenAxes.set(normTag(w), word.axes);
const tags = summarizeAuthorTags(photos, profiles ?? [], new Set(screenAxes.keys()));
const additions = (JSON.parse(readFileSync(path.join(EMBED, "mood-additions.json"), "utf8")) as { entries: Addition[] }).entries;
const edits = jsonl<PhotoTermEdit>(path.join(EMBED, "mood-edits", "photo-term-edits.jsonl"));
const axes = jsonl<PhotoTermAxes>(path.join(EMBED, "mood-edits", "photo-term-axes.jsonl"));
const merges = jsonl<PhotoTermMerge>(path.join(EMBED, "mood-edits", "photo-term-merges.jsonl"));   // 묶음 안 같은 낱말의 다른 표기 → 대표

const rows = mergePhotoTerms(additions, tags, screenAxes, edits, axes, merges);
const kept = rows.filter((r) => !r.drop);
const out = path.join(EMBED, "out", "mood-vocabulary", "photo-terms.jsonl");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, kept.map((r) => JSON.stringify({ term: r.label, axes: r.axes, usage: r.usage, kind: r.kind, from: r.from, alt: r.alt ?? [], photos: r.photos })).join("\n") + "\n", "utf8");
console.log(`뼈대 ${kept.length} (뺀 말 ${rows.length - kept.length}) → ${path.relative(ROOT, out)}`);

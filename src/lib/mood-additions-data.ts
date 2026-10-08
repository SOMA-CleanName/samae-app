import "server-only";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { normLabel, type Addition } from "@/lib/mood-additions";

// 사전 밖 표현은 저장소에 커밋된 파일에서 읽는다(build_mood_additions.py). DB 에는 쓰지 않는다.
const EMBED = path.join(process.cwd(), "scripts", "embed");
const ADDITIONS = path.join(EMBED, "mood-additions.json");
const TERMS = path.join(EMBED, "mood-terms-bundle.json");
const AXES = path.join(EMBED, "mood-axes-bundle.json");

let cache: { at: number; entries: Addition[]; known: Set<string> } | null = null;

/** 모아 둔 표현과, 새 어휘에 이미 있는 말(검색어 · 별칭 · 묶음 이름 · 식구 낱말). */
export async function loadAdditions(): Promise<{ entries: Addition[]; known: Set<string> }> {
  try {
    const at = Math.max(...(await Promise.all([ADDITIONS, TERMS, AXES].map(async (p) => (await stat(p)).mtimeMs))));
    if (cache?.at !== at) {
      const [additions, terms, axes] = await Promise.all([ADDITIONS, TERMS, AXES].map((p) => readFile(p, "utf8")));
      const known = new Set<string>();
      for (const r of (JSON.parse(terms) as { rows: { head: string; terms: string[]; aliases: Record<string, string> }[] }).rows) {
        for (const w of [r.head, ...r.terms, ...Object.keys(r.aliases)]) known.add(normLabel(w));
      }
      for (const g of (JSON.parse(axes) as { groups: { head: string; members: string[] }[] }).groups) {
        for (const w of [g.head, ...g.members]) known.add(normLabel(w));
      }
      cache = { at, entries: (JSON.parse(additions) as { entries: Addition[] }).entries, known };
    }
    return { entries: cache.entries, known: cache.known };
  } catch {
    return { entries: [], known: new Set() };
  }
}

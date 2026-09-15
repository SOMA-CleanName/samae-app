import "server-only";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Group, Sense, Verdict } from "@/lib/mood-review";

// 검수 대상은 DB가 아니라 저장소에 커밋된 번들이다. 원본 산출물은
// scripts/embed/out/ (Git 제외, 만든 PC에만 있음) 이라 그대로 읽으면 다른 PC에서
// 화면이 뜨지 않는다. build_mood_review_bundle.py 가 검수에 필요한 것만 추려 둔다.
const EMBED = path.join(process.cwd(), "scripts", "embed");
const BUNDLE = path.join(EMBED, "mood-review-bundle.json");
// 판정은 산출물 쪽에 쌓는다 — 작업 기록이지 코드가 아니다.
const DECISIONS = path.join(EMBED, "out", "mood-vocabulary", "head-review.json");

export type { Group, Sense, Verdict };

let cache: { groups: Group[]; senses: Record<string, Sense> } | null = null;

/** 번들은 1MB다. 요청마다 파싱하지 않도록 프로세스에 한 번만 올린다. */
export async function loadGraph() {
  if (cache) return cache;
  const bundle = JSON.parse(await readFile(BUNDLE, "utf8")) as {
    groups: Group[];
    senses: Record<string, Omit<Sense, "label">>;
  };
  const senses: Record<string, Sense> = {};
  for (const [label, entry] of Object.entries(bundle.senses)) senses[label] = { label, ...entry };
  cache = { groups: bundle.groups, senses };
  return cache;
}

export async function loadVerdicts(): Promise<Record<string, Verdict>> {
  try {
    return JSON.parse(await readFile(DECISIONS, "utf8"));
  } catch {
    return {};   // 아직 아무것도 판정하지 않은 상태
  }
}

export async function saveVerdict(key: string, verdict: Verdict | null) {
  const all = await loadVerdicts();
  if (verdict) all[key] = verdict;
  else delete all[key];
  await mkdir(path.dirname(DECISIONS), { recursive: true });
  await writeFile(DECISIONS, JSON.stringify(all, null, 1), "utf8");
  return all;
}

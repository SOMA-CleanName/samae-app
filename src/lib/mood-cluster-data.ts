import "server-only";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import type { ClusterCase, ClusterReview } from "@/lib/mood-cluster";

// 후보와 사람 판정 모두 커밋되는 자리에 둔다 — 한 PC 에서 검수하고 다른 PC 에서 이어 볼 수 있게.
const EDITS = path.join(process.cwd(), "scripts", "embed", "mood-edits");
const CANDIDATES = path.join(EDITS, "cluster-candidates.json");   // build_cluster_candidates.py
const REVIEWS = path.join(EDITS, "cluster-review.jsonl");

let cache: { at: number; cases: ClusterCase[] } | null = null;

export async function loadClusterCases(): Promise<ClusterCase[]> {
  try {
    const at = (await stat(CANDIDATES)).mtimeMs;
    if (cache?.at !== at) cache = { at, cases: (JSON.parse(await readFile(CANDIDATES, "utf8")) as { cases: ClusterCase[] }).cases };
    return cache.cases;
  } catch {
    return [];
  }
}

export async function loadClusterReviews(): Promise<ClusterReview[]> {
  try {
    return (await readFile(REVIEWS, "utf8"))
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as ClusterReview);
  } catch {
    return [];
  }
}

export async function appendClusterReview(review: ClusterReview) {
  await mkdir(EDITS, { recursive: true });
  const existing = await loadClusterReviews();
  await writeFile(REVIEWS, [...existing, review].map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
}

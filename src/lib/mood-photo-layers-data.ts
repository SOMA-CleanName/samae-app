import "server-only";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClusterCase, ClusterReview } from "@/lib/mood-cluster";
import type { Edit, NeighborBundle } from "@/lib/mood-neighbors";
import type { PhotoFamilies, PhotoFamilyName } from "@/lib/mood-photo-families";

// 사진 무드 표현 뼈대의 위층(무리 D3 · 이웃 그래프 · 가족 D4) — 사전 묶음 쪽 파일과 따로 둔다(docs/40 §17-5). 전부 커밋되는 자리.
const EDITS = path.join(process.cwd(), "scripts", "embed", "mood-edits");
const CANDIDATES = path.join(EDITS, "photo-cluster-candidates.json");   // build_photo_cluster_candidates.py
const REVIEWS = path.join(EDITS, "photo-cluster-review.jsonl");
const CLUSTERS = path.join(EDITS, "photo-clusters.json");               // build_photo_clusters.py
const NEIGHBORS = path.join(EDITS, "photo-neighbors.json");             // judge_photo_neighbors.py
const NEIGHBOR_EDITS = path.join(EDITS, "photo-neighbor-edits.jsonl");
const FAMILIES = path.join(EDITS, "photo-families.json");               // build_photo_families.py
const FAMILY_NAMES = path.join(EDITS, "photo-family-names.jsonl");      // 사람이 붙인 가족 이름

export type PhotoNeighborBundle = NeighborBundle & { nodes: Record<string, { senses: string[]; axes: string[]; usage: string; members: string[] }> };
export type PhotoClusters = { reviewed: number; grouped: number; clusters: { members: string[] }[] };

const jsonl = async <T,>(p: string): Promise<T[]> => {
  try {
    return (await readFile(p, "utf8")).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as T);
  } catch {
    return [];
  }
};
const append = async <T,>(p: string, row: T) => {
  await mkdir(path.dirname(p), { recursive: true });
  const existing = await jsonl<T>(p);
  await writeFile(p, [...existing, row].map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
};

let caseCache: { at: number; cases: ClusterCase[] } | null = null;
export async function loadPhotoClusterCases(): Promise<ClusterCase[]> {
  try {
    const at = (await stat(CANDIDATES)).mtimeMs;
    if (caseCache?.at !== at) caseCache = { at, cases: (JSON.parse(await readFile(CANDIDATES, "utf8")) as { cases: ClusterCase[] }).cases };
    return caseCache.cases;
  } catch {
    return [];
  }
}
export const loadPhotoClusterReviews = () => jsonl<ClusterReview>(REVIEWS);
export const appendPhotoClusterReview = (review: ClusterReview) => append(REVIEWS, review);

export async function loadPhotoClusters(): Promise<PhotoClusters | null> {
  try {
    return JSON.parse(await readFile(CLUSTERS, "utf8")) as PhotoClusters;
  } catch {
    return null;
  }
}

let neighborCache: { at: number; bundle: PhotoNeighborBundle } | null = null;
export async function loadPhotoNeighborBundle(): Promise<PhotoNeighborBundle | null> {
  try {
    const at = (await stat(NEIGHBORS)).mtimeMs;
    if (neighborCache?.at !== at) neighborCache = { at, bundle: JSON.parse(await readFile(NEIGHBORS, "utf8")) as PhotoNeighborBundle };
    return neighborCache.bundle;
  } catch {
    return null;   // 아직 판정하지 않았다
  }
}
export const loadPhotoNeighborEdits = () => jsonl<Edit>(NEIGHBOR_EDITS);
export const appendPhotoNeighborEdit = (edit: Edit) => append(NEIGHBOR_EDITS, edit);

let familyCache: { at: number; data: PhotoFamilies } | null = null;
export async function loadPhotoFamilies(): Promise<PhotoFamilies | null> {
  try {
    const at = (await stat(FAMILIES)).mtimeMs;
    if (familyCache?.at !== at) familyCache = { at, data: JSON.parse(await readFile(FAMILIES, "utf8")) as PhotoFamilies };
    return familyCache.data;
  } catch {
    return null;   // 아직 뭉치지 않았다
  }
}
export const loadPhotoFamilyNames = () => jsonl<PhotoFamilyName>(FAMILY_NAMES);
export const appendPhotoFamilyName = (row: PhotoFamilyName) => append(FAMILY_NAMES, row);

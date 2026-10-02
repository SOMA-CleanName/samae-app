import "server-only";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClusterCase, ClusterReview } from "@/lib/mood-cluster";
import type { Edit, NeighborBundle } from "@/lib/mood-neighbors";
import type { PhotoFamilies, PhotoFamilyNote, PhotoLayerName } from "@/lib/mood-photo-families";
import type {
  BandConfirm, FamilyPromptDrafts, FamilyPromptEdit, FamilyPromptKoDrafts, FamilyPromptKoEdit, FamilyReview, PhotoMoodLayers, PhotoMoodTagEdit, PhotoMoodTags,
} from "@/lib/mood-photo-tags";

// 사진 무드 표현 뼈대의 위층(무리 D3 · 이웃 그래프 · 가족 D4) — 사전 묶음 쪽 파일과 따로 둔다(docs/40 §17-5). 전부 커밋되는 자리.
const EDITS = path.join(process.cwd(), "scripts", "embed", "mood-edits");
const CANDIDATES = path.join(EDITS, "photo-cluster-candidates.json");   // build_photo_cluster_candidates.py
const REVIEWS = path.join(EDITS, "photo-cluster-review.jsonl");
const CLUSTERS = path.join(EDITS, "photo-clusters.json");               // build_photo_clusters.py
const NEIGHBORS = path.join(EDITS, "photo-neighbors.json");             // judge_photo_neighbors.py
const NEIGHBOR_EDITS = path.join(EDITS, "photo-neighbor-edits.jsonl");
const FAMILIES = path.join(EDITS, "photo-families.json");               // build_photo_families.py
const FAMILY_NOTES = path.join(EDITS, "photo-family-notes.json");       // 가족이 무엇으로 묶였나 — 이름 대신 글
const MOOD_NAMES = path.join(EDITS, "photo-mood-names.jsonl");        // 큰 무드 이름 — 사람이 짓는다
const FAMILY_NAMES = path.join(EDITS, "photo-family-names.jsonl");    // 가족 이름 — Claude 임시 → 사람이 고친다
const TAG_LAYERS = path.join(EDITS, "photo-mood-layers-v1.json");     // 사진 태그용으로 굳힌 층(tag_photo_moods.py)
const TAGS = path.join(EDITS, "photo-mood-tags-v1.json");              // 사진마다 붙인 가족 · 큰 무드 태그(검수 전)
const TAG_EDITS = path.join(EDITS, "photo-mood-tag-edits.jsonl");      // 검수에서 뺀 · 되살린 태그
const FAMILY_PROMPTS = path.join(EDITS, "photo-family-prompts.json");  // 가족마다 영어 문장 — qwen 초안(build_family_prompts.py)
const FAMILY_PROMPT_EDITS = path.join(EDITS, "photo-family-prompt-edits.jsonl"); // 사람이 고친 문장
const FAMILY_PROMPTS_KO = path.join(EDITS, "photo-family-prompts-ko.json"); // 영어 문장의 한글 짝 — 초벌
const FAMILY_PROMPT_KO_EDITS = path.join(EDITS, "photo-family-prompt-ko-edits.jsonl"); // 사람이 고친 한글(그때의 영어 짝과 함께)
const FAMILY_REVIEWS = path.join(EDITS, "photo-mood-family-reviews.jsonl"); // 가족 단위 검수 — 통과 · 기준 올리기 · 문장 고치기
const TAG_CONFIRMED = path.join(EDITS, "photo-mood-tag-confirmed.jsonl"); // 단계별 소거 — 구간마다 통과해 확정한 사진

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
/** 가족 · 큰 무드의 글. 큰 무드의 식구는 든 가족들의 묶음 전체다 */
export async function loadPhotoFamilyNotes(): Promise<{ families: PhotoFamilyNote[]; moods: PhotoFamilyNote[] }> {
  try {
    const raw = JSON.parse(await readFile(FAMILY_NOTES, "utf8")) as { notes?: PhotoFamilyNote[]; moods?: PhotoFamilyNote[] };
    return { families: raw.notes ?? [], moods: raw.moods ?? [] };
  } catch {
    return { families: [], moods: [] };   // 아직 적지 않았다
  }
}

export const loadPhotoMoodNames = () => jsonl<PhotoLayerName>(MOOD_NAMES);
export const appendPhotoMoodName = (row: PhotoLayerName) => append(MOOD_NAMES, row);
export const loadPhotoFamilyNames = () => jsonl<PhotoLayerName>(FAMILY_NAMES);
export const appendPhotoFamilyName = (row: PhotoLayerName) => append(FAMILY_NAMES, row);

const readJson = async <T,>(p: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(p, "utf8")) as T;
  } catch {
    return null;   // 아직 만들지 않았다
  }
};
export const loadPhotoMoodLayers = () => readJson<PhotoMoodLayers>(TAG_LAYERS);
export const loadPhotoMoodTags = () => readJson<PhotoMoodTags>(TAGS);
export const loadPhotoMoodTagEdits = () => jsonl<PhotoMoodTagEdit>(TAG_EDITS);
export const appendPhotoMoodTagEdit = (row: PhotoMoodTagEdit) => append(TAG_EDITS, row);
export const loadFamilyPromptDrafts = () => readJson<FamilyPromptDrafts>(FAMILY_PROMPTS);
export const loadFamilyPromptEdits = () => jsonl<FamilyPromptEdit>(FAMILY_PROMPT_EDITS);
export const appendFamilyPromptEdit = (row: FamilyPromptEdit) => append(FAMILY_PROMPT_EDITS, row);
export const loadFamilyReviews = () => jsonl<FamilyReview>(FAMILY_REVIEWS);
export const appendFamilyReview = (row: FamilyReview) => append(FAMILY_REVIEWS, row);
export const loadFamilyPromptKoDrafts = () => readJson<FamilyPromptKoDrafts>(FAMILY_PROMPTS_KO);
export const loadFamilyPromptKoEdits = () => jsonl<FamilyPromptKoEdit>(FAMILY_PROMPT_KO_EDITS);
export const appendFamilyPromptKoEdit = (row: FamilyPromptKoEdit) => append(FAMILY_PROMPT_KO_EDITS, row);
export const loadBandConfirms = () => jsonl<BandConfirm>(TAG_CONFIRMED);
export const appendBandConfirm = (row: BandConfirm) => append(TAG_CONFIRMED, row);

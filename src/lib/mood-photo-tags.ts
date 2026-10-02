// 사진마다 붙인 가족(D4) · 큰 무드(D5) 태그 — 검수 화면의 순수 로직 (docs/47, 2026-10-01).
// tag_photo_moods.py 가 만든 결과(photo-mood-tags-v1.json)와 굳힌 층(photo-mood-layers-v1.json)을 읽기만 한다.
// 사람이 검수에서 뺀 태그는 photo-mood-tag-edits.jsonl 에 한 줄씩 — 마지막 줄이 이긴다. DB 에는 아직 쓰지 않는다(검수 후 반영).

export type TagLayer = "family" | "big";

export type PhotoMoodLayers = {
  version: string;
  frozen_at: string;
  families: { key: string; name: string; name_by: string; big: string; bundles: string[]; words: string[] }[];
  moods: { key: string; name: string; families: string[] }[];
};

/** [키, z, 작가 태그와 맞았나] · 큰 무드는 [키, z] · near — 태그가 하나도 없는 사진만, 가장 가까웠던 가족 셋 [키, z] */
export type PhotoMoodTagRow = { families: [string, number, boolean][]; moods: [string, number][]; near?: [string, number][] };

export type PhotoMoodTags = {
  version: string;
  made_at: string;
  z_cut: number;
  /** 저장된 가장 낮은 z — 가족 기준을 여기까지 낮출 수 있다(없으면 z_cut) */
  z_floor?: number;
  tag_bonus: number;
  measured: Record<string, string>;
  photos: Record<string, PhotoMoodTagRow>;
};

/** 가족마다 SigLIP 에 물을 영어 문장 — qwen 초안(photo-family-prompts.json) · 사람이 고친 것(photo-family-prompt-edits.jsonl) */
export type FamilyPromptDrafts = Record<string, { prompts: string[]; by: string; at: string }>;
export type FamilyPromptEdit = { key: string; prompts: string[]; at: string };

/** 이 가족의 지금 문장 — 사람이 고친 마지막 줄이 초안을 이긴다 */
export function familyPromptsFor(key: string, drafts: FamilyPromptDrafts | null, edits: readonly FamilyPromptEdit[]): { prompts: string[]; edited: boolean } {
  for (let i = edits.length - 1; i >= 0; i--) if (edits[i].key === key) return { prompts: edits[i].prompts, edited: true };
  return { prompts: drafts?.[key]?.prompts ?? [], edited: false };
}

/** 편집 칸의 글 → 문장 목록. 한 줄에 한 문장, 빈 줄은 버리고 최대 8개 · 한 문장 120자(서버 한도) */
export function parsePromptText(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim().replace(/\.$/, "")).filter(Boolean).slice(0, 8).map((l) => l.slice(0, 120));
}

export type PhotoMoodTagEdit = { photo: string; layer: TagLayer; key: string; action: "drop" | "keep"; at: string };

/** 검수에서 뺀 (사진, 층, 키) — 마지막 줄이 이긴다 */
export function droppedTags(edits: readonly PhotoMoodTagEdit[]): Set<string> {
  const out = new Set<string>();
  for (const e of edits) {
    const id = `${e.photo}|${e.layer}|${e.key}`;
    if (e.action === "drop") out.add(id);
    else out.delete(id);
  }
  return out;
}

export const tagId = (photo: string, layer: TagLayer, key: string) => `${photo}|${layer}|${key}`;

export type TaggedPhotoRow = { photo: string; z: number; byTag: boolean; dropped: boolean };

/** 한 가족 · 큰 무드에 붙은 사진 — 점수 높은 순. 뺀 것도 돌려준다(화면이 흐리게 보이고 되살릴 수 있게) */
export function photosWithTag(tags: PhotoMoodTags, layer: TagLayer, key: string, dropped: ReadonlySet<string>): TaggedPhotoRow[] {
  const rows: TaggedPhotoRow[] = [];
  for (const [photo, row] of Object.entries(tags.photos)) {
    const hit = layer === "family" ? row.families.find(([k]) => k === key) : row.moods.find(([k]) => k === key);
    if (!hit) continue;
    rows.push({ photo, z: hit[1], byTag: layer === "family" ? Boolean(hit[2]) : false, dropped: dropped.has(tagId(photo, layer, key)) });
  }
  return rows.sort((a, b) => b.z - a.z || a.photo.localeCompare(b.photo));
}

/** 가족 · 큰 무드마다 붙은 사진 수(뺀 것 제외) */
export function tagCounts(tags: PhotoMoodTags, layer: TagLayer, dropped: ReadonlySet<string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [photo, row] of Object.entries(tags.photos)) {
    const keys = layer === "family" ? row.families.map(([k]) => k) : row.moods.map(([k]) => k);
    for (const key of keys) if (!dropped.has(tagId(photo, layer, key))) out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

/** 사진별 보기에 쓸 표본 — 사진 id 를 seed 로 섞어 앞에서 n 장. 같은 seed 면 같은 표본 */
export function samplePhotos(tags: PhotoMoodTags, n: number, seed: number): string[] {
  const ids = Object.keys(tags.photos).sort();
  let s = (seed >>> 0) || 1;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, n);
}

/** 태그가 하나도 없는 사진 — 가장 가까웠던 가족의 점수가 높은 순(아깝게 놓친 것부터) */
export function untaggedPhotos(tags: PhotoMoodTags): { photo: string; near: [string, number][] }[] {
  return Object.entries(tags.photos)
    .filter(([, row]) => !row.families.length)
    .map(([photo, row]) => ({ photo, near: row.near ?? [] }))
    .sort((a, b) => (b.near[0]?.[1] ?? -Infinity) - (a.near[0]?.[1] ?? -Infinity) || a.photo.localeCompare(b.photo));
}

export type PhotoSort = "many" | "few" | "random";

/**
 * 사진별 태그 화면의 목록 — 정렬(태그 많은 순 · 적은 순 · 무작위)과 큰 무드 거르기. 뺀 태그는 세지 않는다.
 * 같은 장수끼리는 사진 id 순이라 쪽을 넘겨도 순서가 흔들리지 않는다.
 */
export function listTaggedPhotos(tags: PhotoMoodTags, dropped: ReadonlySet<string>,
  { sort, big, seed = 1 }: { sort: PhotoSort; big?: string; seed?: number }): string[] {
  const live = (photo: string, row: PhotoMoodTagRow) => row.families.filter(([k]) => !dropped.has(tagId(photo, "family", k))).length;
  let rows = Object.entries(tags.photos);
  if (big) rows = rows.filter(([photo, row]) => row.moods.some(([k]) => k === big && !dropped.has(tagId(photo, "big", k))));
  if (sort === "random") return samplePhotos({ ...tags, photos: Object.fromEntries(rows) }, rows.length, seed);
  const dir = sort === "many" ? -1 : 1;
  return rows
    .map(([photo, row]) => ({ photo, n: live(photo, row) }))
    .sort((a, b) => dir * (a.n - b.n) || a.photo.localeCompare(b.photo))
    .map((r) => r.photo);
}

/**
 * 가족 단위 검수(docs/47 §5, 사람 결정 2026-10-01) — 사진 한 장씩이 아니라 가족마다 판정한다. 큰 무드는 가족에서 물려받으므로 따로 보지 않는다.
 * 판정과 기준은 따로 기억한다(통과를 눌러도 정한 기준이 남게):
 *   status  pass 통과 · rewrite 문장 고칠 것 · todo 판정 지우기(검수 전으로)
 *   cut     이 가족의 기준 z — 가족마다 다르게(사람 결정 2026-10-01). 기본(z_cut)보다 낮출 수도 있다(저장된 z_floor 까지). null 은 기본으로
 * 기록 photo-mood-family-reviews.jsonl, 한 줄에 status 나 cut 중 하나 이상, 각각 가족마다 마지막 줄이 이긴다.
 */
export type FamilyReviewStatus = "pass" | "rewrite" | "todo";
export type FamilyReview = { key: string; status?: FamilyReviewStatus; cut?: number | null; at: string };
export type FamilyReviewState = { status?: "pass" | "rewrite"; cut?: number };

export function latestReviews(rows: readonly FamilyReview[]): Map<string, FamilyReviewState> {
  const out = new Map<string, FamilyReviewState>();
  for (const r of rows) {
    const cur = { ...(out.get(r.key) ?? {}) };
    if (r.status === "todo") delete cur.status;
    else if (r.status) cur.status = r.status;
    if (r.cut === null) delete cur.cut;
    else if (typeof r.cut === "number") cur.cut = r.cut;
    if (cur.status || cur.cut !== undefined) out.set(r.key, cur);
    else out.delete(r.key);
  }
  return out;
}

/** 이 가족의 기준 — 정했으면 그 점수(저장된 바닥 아래로는 못 내린다), 아니면 기본 */
export const familyCut = (key: string, reviews: ReadonlyMap<string, FamilyReviewState>, base: number, floor = base) => {
  const cut = reviews.get(key)?.cut;
  return typeof cut === "number" ? Math.max(floor, cut) : base;
};

/** 기준별로 남는 사진 수 — 가족 화면의 기준 표. 뺀 사진은 세지 않는다 */
export function countsAtCuts(rows: readonly TaggedPhotoRow[], cuts: readonly number[]): [number, number][] {
  return cuts.map((cut) => [cut, rows.filter((r) => !r.dropped && r.z >= cut).length]);
}

/**
 * 검수를 반영한 사진의 태그 — 가족은 가족 기준 아래 · 뺀 것을 거르고, 큰 무드는 **남은 가족에서 다시 물려받는다**
 * (점수는 그중 가장 높은 가족 z). 큰 무드를 직접 뺀 것도 거른다.
 */
export function liveTags(row: PhotoMoodTagRow, photo: string, bigOf: ReadonlyMap<string, string>,
  { dropped, reviews, base, floor }: { dropped: ReadonlySet<string>; reviews: ReadonlyMap<string, FamilyReviewState>; base: number; floor?: number }): PhotoMoodTagRow {
  const families = row.families.filter(([k, z]) => z >= familyCut(k, reviews, base, floor) && !dropped.has(tagId(photo, "family", k)));
  const best = new Map<string, number>();
  for (const [k, z] of families) {
    const big = bigOf.get(k);
    if (big && !dropped.has(tagId(photo, "big", big))) best.set(big, Math.max(best.get(big) ?? -Infinity, z));
  }
  return { families, moods: [...best].sort((a, b) => b[1] - a[1]), ...(row.near ? { near: row.near } : {}) };
}

/** 검수를 반영한 전체 — 화면들이 이 결과로 센다 */
export function applyReview(tags: PhotoMoodTags, bigOf: ReadonlyMap<string, string>,
  opts: { dropped: ReadonlySet<string>; reviews: ReadonlyMap<string, FamilyReviewState> }): PhotoMoodTags {
  const photos: Record<string, PhotoMoodTagRow> = {};
  for (const [photo, row] of Object.entries(tags.photos)) photos[photo] = liveTags(row, photo, bigOf, { ...opts, base: tags.z_cut, floor: tags.z_floor });
  return { ...tags, photos };
}

/** 경계 구간 — 가족 기준을 겨우 넘은 사진부터(점수 낮은 순). 틀린 태그는 여기 몰린다 */
export function borderline(rows: readonly TaggedPhotoRow[], cut: number, n: number): TaggedPhotoRow[] {
  return rows.filter((r) => r.z >= cut).sort((a, b) => a.z - b.z || a.photo.localeCompare(b.photo)).slice(0, n);
}

/** 무드 화면의 가족(지금 뭉친 것) → 사진 태그용으로 굳힌 v1 가족 키. 식구가 절반 이상 겹치는 가장 가까운 것, 없으면 null */
export function v1KeyFor(members: readonly string[], layers: PhotoMoodLayers | null): string | null {
  if (!layers) return null;
  const mine = new Set(members);
  let best: { key: string; overlap: number } | null = null;
  for (const f of layers.families) {
    const shared = f.bundles.filter((b) => mine.has(b)).length;
    const overlap = shared / (mine.size + f.bundles.length - shared || 1);
    if (!best || overlap > best.overlap) best = { key: f.key, overlap };
  }
  return best && best.overlap >= 0.5 ? best.key : null;
}

/** 한글이 들어간 줄인가 — 한글로 쓴 줄만 영어로 바꾼다 */
export const hasHangul = (line: string) => /[가-힣ㄱ-ㆎ]/u.test(line);

/** 모델 답을 문장 하나로 — 생각 블록 · 따옴표 · 번호 · 마침표를 걷고 "a photo of" 로 시작하게 */
export function cleanCaption(text: string): string | null {
  const body = text.includes("</think>") ? text.split("</think>").pop()! : text;
  const line = body.split(/\r?\n/).map((l) => l.trim().replace(/^[-•*\d.\s"']+|["'\s.]+$/g, "")).find((l) => l.length > 0);
  if (!line || hasHangul(line)) return null;
  // "a photo of …" 또는 "a black and white photo of …" · "a film photo of …" 처럼 사진 꼴을 앞에 둔 것은 그대로
  const sentence = /^an?\s+(?:[\w-]+\s+){0,3}photo\b/i.test(line) ? line : `a photo of ${line}`;
  return sentence.charAt(0).toLowerCase() + sentence.slice(1, 120);
}

/**
 * 가족 문장의 한글 짝(사람 요청 2026-10-01 — 영어 칸 아래 한글 칸, 한글로 고치면 영어로).
 * 초벌 photo-family-prompts-ko.json {key: {prompts_ko, from(옮길 때의 영어)}} · 사람이 고친 것 photo-family-prompt-ko-edits.jsonl {key, prompts_ko, prompts_en}.
 * 줄마다 짝이다 — 한글 i 번째 ↔ 영어 i 번째.
 */
export type FamilyPromptKoDrafts = Record<string, { prompts_ko: string[]; from: string[]; by: string; at: string }>;
export type FamilyPromptKoEdit = { key: string; prompts_ko: string[]; prompts_en: string[]; at: string };

/**
 * 이 가족의 한글 문장과 그 짝인 영어. 사람이 고친 마지막 줄 → 초벌 순. `stale` — 지금 영어가 한글을 만들 때의 영어와 다르다
 * (영어 칸을 따로 고쳤다). 그때는 한글이 예전 영어 기준이라고 화면이 알린다.
 */
export function familyKoFor(key: string, english: readonly string[], drafts: FamilyPromptKoDrafts | null, edits: readonly FamilyPromptKoEdit[]):
  { lines: string[]; pairedEn: string[]; edited: boolean; stale: boolean } {
  for (let i = edits.length - 1; i >= 0; i--) {
    if (edits[i].key === key) return { lines: edits[i].prompts_ko, pairedEn: edits[i].prompts_en, edited: true, stale: !sameLines(edits[i].prompts_en, english) };
  }
  const d = drafts?.[key];
  return d ? { lines: d.prompts_ko, pairedEn: d.from, edited: false, stale: !sameLines(d.from, english) } : { lines: [], pairedEn: [], edited: false, stale: false };
}

const sameLines = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * 한글 칸을 영어로 — **바뀐 한글 줄만** 다시 번역한다. 그대로인 줄(예전 한글과 글자가 같은 줄)은 그 짝 영어를 그대로 쓴다.
 * 한 줄만 고쳤는데 나머지 줄까지 다시 번역되면 뜻이 흔들린다(작약 → 백합 같은 오역). 순서가 아니라 내용으로 짝짓는다 — 줄을 지우거나 옮겨도 안전하다.
 */
export function planTranslation(newKo: readonly string[], oldKo: readonly string[], oldEn: readonly string[]): { ko: string; keep: string | null }[] {
  const pair = new Map<string, string>();
  oldKo.forEach((ko, i) => { if (oldEn[i]) pair.set(ko.trim(), oldEn[i]); });
  return newKo.map((ko) => ({ ko, keep: pair.get(ko.trim()) ?? null }));
}

/**
 * 단계별 소거법(사람 결정 2026-10-01) — 유사도가 높을수록 맞을 확률이 높다. 가족마다 점수 구간을 위에서부터 하나씩 본다:
 * 3.0 이상 → 2.75 → 2.5 → … → 1.0. 구간의 사진만 보고 틀린 것을 뺀 뒤 [이 구간 통과] → 남은 사진이 그 가족 태그로 **확정**된다.
 * 확정 기록 photo-mood-tag-confirmed.jsonl {key, band, photos, at} — (가족, 구간)마다 마지막 줄이 이긴다. photos null 은 확정 취소.
 */
export const BANDS = [3.0, 2.75, 2.5, 2.25, 2.0, 1.75, 1.5, 1.25, 1.0] as const;
export type BandConfirm = { key: string; band: number; photos: string[] | null; at: string };

/** 구간의 위 경계 — 맨 위 구간은 끝이 없다 */
export const bandTop = (band: number) => {
  const i = BANDS.indexOf(band as (typeof BANDS)[number]);
  return i <= 0 ? Infinity : BANDS[i - 1];
};

/** 이 점수가 드는 구간(가장 낮은 구간 아래면 null) */
export const bandOf = (z: number) => BANDS.find((b) => z >= b) ?? null;

/** 가족마다 확정된 구간 → 사진들. 취소(null)는 지운다 */
export function latestConfirms(rows: readonly BandConfirm[]): Map<string, Map<number, string[]>> {
  const out = new Map<string, Map<number, string[]>>();
  for (const r of rows) {
    const bands = out.get(r.key) ?? new Map<number, string[]>();
    if (r.photos) bands.set(r.band, r.photos);
    else bands.delete(r.band);
    out.set(r.key, bands);
  }
  return out;
}

/** 이 가족에서 확정된 사진 — 확정한 뒤 뺀 사진은 빠진다 */
export function confirmedPhotos(key: string, confirms: ReadonlyMap<string, ReadonlyMap<number, readonly string[]>>, dropped: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const photos of confirms.get(key)?.values() ?? []) for (const p of photos) if (!dropped.has(tagId(p, "family", key))) out.push(p);
  return out;
}

/**
 * 다음에 볼 구간 — **아직 확정도 빼기도 안 한 사진이 남은 가장 높은 구간.** rows 에서 확정한 사진은 미리 뺀다(호출하는 쪽).
 * 통과한 구간이어도 문장을 고쳐 다시 계산하면 새 사진이 들어올 수 있다 — 그러면 다시 그 구간을 본다(사람 결정 2026-10-02). 남은 게 없으면 null
 */
export function nextBand(rows: readonly TaggedPhotoRow[]): number | null {
  return BANDS.find((b) => rows.some((r) => !r.dropped && r.z >= b && r.z < bandTop(b))) ?? null;
}

/** 구간에 든 사진(점수 높은 순) */
export const inBand = (rows: readonly TaggedPhotoRow[], band: number) => rows.filter((r) => r.z >= band && r.z < bandTop(band));

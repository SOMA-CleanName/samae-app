// 신규 사진 무드 태그 — 굳힌 기준으로 점수를 내고, 사진 한 장씩 검수해 확정한다(docs/47 §6, 2026-10-05).
//
// 기준(photo-family-model.json, export_family_model.py)은 지금 검수한 사진들에 쓴 것과 같은 가족 문장 벡터 · 통계다.
// 전체를 다시 계산하면 기존 사진 점수까지 흔들려 검수가 어긋나므로, 새 사진은 이 기준으로만 매긴다(tag_photo_moods.py 와 같은 셈 —
// 기존 사진 33,211 태그를 이 파일로 다시 매기면 z 차이 최대 0.005).
//
//   z = ((사진 · 가족 벡터) − 그 사진의 가족 평균 근접도 − 가족 평균) / 가족 편차      ← 허브 보정 · 고정 통계
//   측정 가족(모노톤 · 하이키 · 다크 · 로우키) = max(z, tone_vec 측정 z)               ← 고정 통계
//   작가 태그가 가족 말과 같으면 + tag_bonus
import type { PhotoMoodTagRow } from "./mood-photo-tags.ts";

export type FamilyModel = {
  made_at: string;
  prompts_hash: string;
  z_cut: number;
  z_floor: number;
  tag_bonus: number;
  families: string[];
  words: Record<string, string[]>;
  dim: number;
  /** 가족 벡터(가족 순서대로) — little-endian float32 를 base64 로 */
  vectors: string;
  stats: Record<string, [number, number]>;
  measured: Record<string, string>;
  tone_stats: Record<string, [number, number]>;
};

/** 픽셀로 재는 가족 — tag_photo_moods.py MEASURED 와 같다. tone_vec: 0~15 L 히스토그램 · 16~19 a/b · 20 chroma평균 · 21 chroma편차 */
const MEASURE: Record<string, (t: readonly number[]) => number> = {
  f05: (t) => -t[20],
  f63: (t) => t[12] + t[13] + t[14] + t[15],
  f66: (t) => t[0] + t[1] + t[2] + t[3],
  f92: (t) => t[0] + t[1] + t[2] + t[3] - (t[8] + t[9] + t[10] + t[11]),
};

/** 태그 말 비교용 — python norm 과 같다(NFKC · 소문자 · 글자와 숫자만) */
export const normTag = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export function decodeVectors(model: Pick<FamilyModel, "vectors" | "dim" | "families">): Float32Array[] {
  const bytes = Uint8Array.from(atob(model.vectors), (c) => c.charCodeAt(0));
  const all = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  return model.families.map((_, k) => all.subarray(k * model.dim, (k + 1) * model.dim));
}

/** 사진 한 장의 가족 점수 — z 높은 순, floor(기본 z_floor) 이상만. [가족, z, 작가 태그로 붙었나] */
export function scoreNewPhoto(
  model: FamilyModel,
  vectors: readonly Float32Array[],
  photo: { embedding: readonly number[]; tone: readonly number[] | null; tags: readonly string[] },
  floor = model.z_floor,
): [string, number, boolean][] {
  const v = photo.embedding;
  const norm = Math.hypot(...v) || 1;
  const sims = vectors.map((f) => {
    let dot = 0;
    for (let i = 0; i < f.length; i++) dot += f[i] * v[i];
    return dot / norm;
  });
  const hub = sims.reduce((a, b) => a + b, 0) / sims.length;              // 허브 보정 — 이 사진의 가족 평균 근접도
  const tags = new Set(photo.tags.map(normTag).filter(Boolean));
  const out: [string, number, boolean][] = [];
  model.families.forEach((key, k) => {
    const [mean, std] = model.stats[key];
    let z = (sims[k] - hub - mean) / (std || 1);
    const measure = MEASURE[key];
    if (measure && photo.tone && model.tone_stats[key]) {
      const [m, sd] = model.tone_stats[key];
      z = Math.max(z, (measure(photo.tone) - m) / (sd || 1));
    }
    const tagged = (model.words[key] ?? []).some((w) => tags.has(normTag(w)));
    if (tagged) z += model.tag_bonus;
    if (z >= floor) out.push([key, Math.round(z * 100) / 100, tagged]);
  });
  return out.sort((a, b) => b[1] - a[1]);
}

/** 점수 → 태그 줄(tag_photo_moods.py 결과와 같은 꼴). 큰 무드는 기본 기준으로 미리 적고, 태그가 없으면 가까웠던 가족 셋을 near 에 */
export function newPhotoRow(families: [string, number, boolean][], bigOf: ReadonlyMap<string, string>, zCut: number, all?: [string, number][]): PhotoMoodTagRow {
  const bigs = new Map<string, number>();
  for (const [key, z] of families) {
    const big = bigOf.get(key);
    if (z >= zCut && big) bigs.set(big, Math.max(bigs.get(big) ?? -Infinity, z));
  }
  const row: PhotoMoodTagRow = { families, moods: [...bigs].sort((a, b) => b[1] - a[1]) };
  if (!families.some(([, z]) => z >= zCut) && all) row.near = all.slice(0, 3);
  return row;
}

/** 신규 사진 확정 기록 — {photo, families(확정한 가족, null 이면 취소)}. 마지막 줄이 이긴다 */
export type NewPhotoConfirm = { photo: string; families: string[] | null; at: string };

export function latestNewConfirms(rows: readonly NewPhotoConfirm[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rows) {
    if (r.families) out.set(r.photo, r.families);
    else out.delete(r.photo);
  }
  return out;
}

/** 가족 → 신규 사진 확정 — 확정한 뒤 뺀 태그는 빠진다(검수 화면과 같은 규칙) */
export function newConfirmedByFamily(confirms: ReadonlyMap<string, readonly string[]>, dropped: ReadonlySet<string>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [photo, families] of confirms) {
    for (const key of families) {
      if (dropped.has(`${photo}|family|${key}`)) continue;
      out.set(key, [...(out.get(key) ?? []), photo]);
    }
  }
  return out;
}

/**
 * 신규 사진에 제안하는 가족 — 가족마다 제안 기준(cutOf) 이상이고, 문장을 고칠 가족(off)이 아닌 것. 뺀 것도 표시해 돌려준다
 */
export function proposedFamilies(
  photo: string,
  row: PhotoMoodTagRow,
  cutOf: (key: string) => number,
  off: (key: string) => boolean,
  dropped: ReadonlySet<string>,
): { key: string; z: number; byTag: boolean; dropped: boolean }[] {
  return row.families
    .filter(([key, z]) => z >= cutOf(key) && !off(key))
    .map(([key, z, byTag]) => ({ key, z, byTag, dropped: dropped.has(`${photo}|family|${key}`) }));
}

/**
 * 신규 사진에 제안할 기준 — 가족 기준(familyCut)과 **검수에서 가장 낮게 확정한 구간** 중 높은 쪽.
 * 2.0 구간까지만 확정하고 그 아래는 다 뺀 가족이면, 새 사진도 2.0 아래는 제안하지 않는다. 확정이 없는 가족은 가족 기준 그대로.
 */
export function proposalCut(familyCut: number, confirmedBands: Iterable<number> | undefined): number {
  const bands = [...(confirmedBands ?? [])];
  return bands.length ? Math.max(familyCut, Math.min(...bands)) : familyCut;
}

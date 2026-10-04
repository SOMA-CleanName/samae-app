// 가족(D4) · 큰 무드(D5) → 사진 색인 — 검색이 쓴다(docs/47 §9 · §10, 2026-10-04).
//
// 검수에서 **확정한 사진**만 싣는다(확정한 뒤 뺀 사진은 빠진다 — 검수 화면과 같은 규칙). 확정이 하나도 없는
// 가족(검수 전)은 빼지 않은 후보를 기준 이상으로 대신 싣고 `unreviewed` 에 적는다. 가족 안의 순서는 점수(z) 높은 순.
// 이름은 화면과 같은 이름 기록에서(식구가 절반 이상 겹치는 마지막 이름) — 연관 검색어에 그대로 나간다.
//
// 만드는 곳: 검수 · 이름 화면의 서버 액션이 저장할 때마다(writeFamilyIndex), 또는 `npx tsx --conditions=react-server scripts/embed/build-family-photo-index.mts`.
import { bigMoodNames, layerNameFor, type PhotoLayerName } from "./mood-photo-families.ts";
import { confirmedPhotos, droppedTags, latestConfirms, tagId, type BandConfirm, type PhotoMoodLayers, type PhotoMoodTagEdit, type PhotoMoodTags } from "./mood-photo-tags.ts";

export type FamilyIndex = {
  made_at: string;
  about: string;
  /** 확정이 없어 후보를 대신 실은 가족 */
  unreviewed: string[];
  /** 사진 id — families 의 숫자는 이 배열의 순번 */
  photos: string[];
  families: Record<string, number[]>;
  /** 가족 이름(사람이 고친 것이 이긴다) */
  names: Record<string, string>;
  /** 가족 → 큰 무드 키. 보류한 가족은 "" */
  big: Record<string, string>;
  moods: { key: string; name: string; families: string[] }[];
};

export function buildFamilyIndex(input: {
  layers: PhotoMoodLayers;
  tags: PhotoMoodTags;
  edits: readonly PhotoMoodTagEdit[];
  confirmRows: readonly BandConfirm[];
  familyNames: readonly PhotoLayerName[];
  moodNames: readonly PhotoLayerName[];
  now: string;
}): FamilyIndex {
  const { layers, tags } = input;
  const dropped = droppedTags(input.edits);
  const confirms = latestConfirms(input.confirmRows);
  const z = new Map<string, number>();                 // 사진|가족 → 점수
  for (const [photo, row] of Object.entries(tags.photos)) for (const [key, score] of row.families) z.set(`${photo}|${key}`, score);
  const zOf = (photo: string, key: string) => z.get(`${photo}|${key}`) ?? 0;
  const cut = tags.z_cut;

  const unreviewed: string[] = [];
  const byFamily = new Map<string, string[]>();
  for (const fam of layers.families) {
    let ids = [...new Set(confirmedPhotos(fam.key, confirms, dropped))];
    if (!ids.length) {
      ids = Object.keys(tags.photos).filter((p) => zOf(p, fam.key) >= cut && !dropped.has(tagId(p, "family", fam.key)));
      if (ids.length) unreviewed.push(fam.key);
    }
    byFamily.set(fam.key, ids.sort((a, b) => zOf(b, fam.key) - zOf(a, fam.key) || a.localeCompare(b)));
  }

  const photos = [...new Set([...byFamily.values()].flat())].sort();
  const at = new Map(photos.map((p, i) => [p, i]));
  const bigName = bigMoodNames(layers, input.moodNames);
  return {
    made_at: input.now,
    about: "가족 → 확정 사진(점수 순), 큰 무드 묶음 · 이름. src/lib/mood-family-index.ts 가 만든다 — 손으로 고치지 말 것",
    unreviewed,
    photos,
    families: Object.fromEntries([...byFamily].map(([k, ids]) => [k, ids.map((p) => at.get(p)!)])),
    names: Object.fromEntries(layers.families.map((f) => [f.key, layerNameFor({ members: f.bundles }, input.familyNames)?.name ?? f.name])),
    big: Object.fromEntries(layers.families.map((f) => [f.key, f.big ?? ""])),
    moods: layers.moods.map((m) => ({ key: m.key, name: bigName.get(m.key) ?? m.name, families: [...m.families] })),
  };
}

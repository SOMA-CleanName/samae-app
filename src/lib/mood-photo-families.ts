// 사진 무드 표현 뼈대의 가족(D4) · 큰 무드(D5) — 순수 로직 (docs/40 §16-1 · §16-2 · §17-5, 2026-09-29).
// build_photo_families.py 가 이웃 그래프를 뭉쳐 만든 것을 읽기만 한다. 가족에는 대표가 없다 — 번호와 식구 묶음, 그리고 사람이 붙인 이름뿐이다.
// 축은 가족을 정하는 데 쓰지 않는다(§16-2 4번). 든 묶음의 축을 세어 보여 줄 뿐이다.

/** 다른 가족에 사는데 이 가족에도 제 무게의 share 만큼 걸친 묶음 — 부모는 여럿을 허용한다(§16-2 2번). 대표 부모는 home */
export type PhotoFamilyGuest = { head: string; home: string; share: number };

export type PhotoFamily = {
  id: string;
  /** 이 가족이 든 큰 무드(D5) */
  big: string;
  /** 식구 묶음 이름 — 묶음이 많은 순, 대표가 아니다 */
  members: string[];
  /** 식구 묶음들이 안은 검색어 수 */
  terms: number;
  /** [축, 그 축인 묶음 수] — 결과로 따라온 것 */
  axes: [string, number][];
  guests: PhotoFamilyGuest[];
};

export type PhotoFamilies = {
  made_at: string;
  resolution: number;
  big_resolution: number;
  weights: Record<string, number>;
  families: PhotoFamily[];
  moods: { id: string; families: string[] }[];
};

/** 사람이 붙인 이름 — mood-edits/photo-family-names.jsonl 에 한 줄씩, 마지막 줄이 이긴다. 빈 이름은 지우기 */
export type PhotoFamilyName = { id: string; name: string; at: string };

/** 마지막 줄만 남긴다. 빈 이름은 뺀다 — 이름을 지운 것이다. */
export function latestFamilyNames(rows: readonly PhotoFamilyName[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) {
    const name = r.name.trim();
    if (name) out.set(r.id, name);
    else out.delete(r.id);
  }
  return out;
}

/** 화면에 쓸 이름 — 사람이 붙였으면 그것, 아니면 번호. 식구 중 하나를 대표로 세우지 않는다. */
export const familyLabel = (f: { id: string }, names: ReadonlyMap<string, string>) => names.get(f.id) ?? f.id.toUpperCase();

/**
 * 큰 무드 · 검색 · 축으로 거른다. 검색은 가족 이름 · 식구 묶음 이름 · 손님 이름에 걸린다.
 * 축은 그 축인 묶음이 하나라도 있는 가족만 — 가족을 축으로 정하지는 않지만 훑을 때는 쓸모가 있다.
 */
export function selectFamilies(families: readonly PhotoFamily[], names: ReadonlyMap<string, string>,
  { q, big, axis }: { q?: string; big?: string; axis?: string }) {
  const needle = (q ?? "").trim();
  return families.filter((f) =>
    (!big || f.big === big)
    && (!axis || f.axes.some(([a]) => a === axis))
    && (!needle || (names.get(f.id) ?? "").includes(needle) || f.members.some((m) => m.includes(needle)) || f.guests.some((g) => g.head.includes(needle))));
}

/** 큰 무드마다 가족 수 · 묶음 수 · 검색어 수. 가족은 큰 무드 하나에만 든다. */
export function moodTally(data: PhotoFamilies) {
  const by = new Map(data.families.map((f) => [f.id, f]));
  return data.moods.map((m) => {
    const fams = m.families.map((id) => by.get(id)).filter((f): f is PhotoFamily => !!f);
    return { id: m.id, families: fams.length, groups: fams.reduce((n, f) => n + f.members.length, 0), terms: fams.reduce((n, f) => n + f.terms, 0) };
  });
}

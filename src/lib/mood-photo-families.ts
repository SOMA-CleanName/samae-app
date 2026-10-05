// 사진 무드 표현 뼈대의 가족(D4) · 큰 무드(D5) — 순수 로직 (docs/40 §16-1 · §16-2 · §17-5, 2026-09-29).
// build_photo_families.py 가 이웃 그래프를 뭉쳐 만든 것을 읽기만 한다. 가족에는 대표도 이름도 없다 — 번호와 식구 묶음,
// 그리고 "무엇을 기준으로 묶였나" 를 적은 글뿐이다(사람 결정, 2026-09-30: 이름을 붙이지 않고 글로 적는다).
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

/** 가족이 무엇을 기준으로 묶였는지 적은 글 — mood-edits/photo-family-notes.json. 적을 때의 식구 목록을 함께 둔다 */
export type PhotoFamilyNote = { members: string[]; note: string };

/** 식구가 이만큼 겹치면 같은 가족으로 본다. 다시 뭉치면 번호가 바뀌어도 글이 따라가게 */
const NOTE_OVERLAP = 0.5;

/**
 * 이 가족의 글. 번호가 아니라 **식구 겹침**으로 짝짓는다 — 다시 뭉치면 번호는 바뀌어도 식구는 대개 남는다.
 * 가장 많이 겹치는 글을 고르고, 겹침(자카드)이 문턱 밑이면 없다. 식구가 똑같지 않으면 `changed` — 글이 옛 식구 기준이다.
 */
export function noteFor(family: { members: readonly string[] }, notes: readonly PhotoFamilyNote[]): { note: string; changed: boolean } | null {
  const mine = new Set(family.members);
  let best: { note: PhotoFamilyNote; overlap: number } | null = null;
  for (const n of notes) {
    const shared = n.members.filter((m) => mine.has(m)).length;
    const overlap = shared / (mine.size + n.members.length - shared || 1);
    if (!best || overlap > best.overlap) best = { note: n, overlap };
  }
  if (!best || best.overlap < NOTE_OVERLAP) return null;
  return { note: best.note.note, changed: best.overlap < 1 };
}

/**
 * 큰 무드(D5) · 가족(D4) 이름 — 한 줄씩 쌓인다(사람 결정 2026-10-01: 큰 무드는 사람이 짓고, 가족은 Claude 가 임시로 지은 뒤 사람이 고친다).
 * 큰 무드 mood-edits/photo-mood-names.jsonl · 가족 photo-family-names.jsonl. 번호는 다시 뭉치면 바뀌므로 **지을 때의 식구 묶음**을 함께 남긴다.
 * by — 사람이 아니라 Claude 가 지은 임시 이름이면 "claude". 화면에서 저장하면 by 없이 남는다(사람 이름).
 */
export type PhotoLayerName = { members: string[]; name: string; at: string; by?: string };

const overlapOf = (a: ReadonlySet<string>, b: readonly string[]) => {
  const shared = b.filter((m) => a.has(m)).length;
  return shared / (a.size + b.length - shared || 1);
};

/**
 * 이 큰 무드 · 가족의 이름. 식구가 절반 이상 겹치는 기록 중 **마지막 줄**이 이긴다(빈 이름이면 지운 것).
 * 식구가 똑같지 않으면 `changed` — 이름을 붙인 뒤 다시 뭉쳐 식구가 바뀌었다. `draft` — Claude 가 지은 임시 이름.
 */
export function layerNameFor(layer: { members: readonly string[] }, names: readonly PhotoLayerName[]): { name: string; changed: boolean; draft: boolean } | null {
  const mine = new Set(layer.members);
  for (let i = names.length - 1; i >= 0; i--) {
    const overlap = overlapOf(mine, names[i].members);
    if (overlap < NOTE_OVERLAP) continue;
    const name = names[i].name.trim();
    return name ? { name, changed: overlap < 1, draft: names[i].by === "claude" } : null;
  }
  return null;
}

/**
 * 굳힌 층(v1)의 큰 무드 이름 — 이름 기록(photo-mood-names.jsonl)에서 식구로 짝지은 마지막 이름, 없으면 층에 적힌 이름.
 * 화면에서 이름을 고치면 사진 태그 화면에도 바로 따라온다(사람 요청 2026-10-04).
 */
export function bigMoodNames(layers: { families: readonly { key: string; bundles: readonly string[] }[]; moods: readonly { key: string; name: string; families: readonly string[] }[] },
  names: readonly PhotoLayerName[]): Map<string, string> {
  const bundles = new Map(layers.families.map((f) => [f.key, f.bundles]));
  return new Map(layers.moods.map((m) => [m.key, layerNameFor({ members: m.families.flatMap((k) => bundles.get(k) ?? []) }, names)?.name ?? m.name]));
}

/**
 * 가족 식구(D2 묶음)를 무리(D3)로 모은다 — 같은 무리인 묶음은 한 덩어리, 무리에 안 든 묶음은 혼자. 식구 순서를 지킨다.
 * 큰 무드 화면에서 "이 큰 무드에 어떤 무리가 들었나" 를 보여 준다(사람 요청 2026-10-04).
 */
export function clustersIn(members: readonly string[], clusters: readonly { members: readonly string[] }[]): string[][] {
  const mine = new Set(members);
  const of = new Map<string, readonly string[]>();
  for (const c of clusters) for (const m of c.members) of.set(m, c.members);
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const m of members) {
    if (seen.has(m)) continue;
    const group = (of.get(m) ?? [m]).filter((x) => mine.has(x) && !seen.has(x));
    for (const x of group) seen.add(x);
    out.push(group.length ? group : [m]);
  }
  return out;
}

/** 화면에 쓸 표시 — 번호뿐이다. 식구 중 하나를 대표로 세우지 않는다. */
export const familyLabel = (f: { id: string }) => f.id.toUpperCase();

/**
 * 큰 무드 · 검색 · 축으로 거른다. 검색은 가족 이름 · 식구 묶음 이름 · 손님 이름 · 가족 글에 걸린다.
 * 축은 그 축인 묶음이 하나라도 있는 가족만 — 가족을 축으로 정하지는 않지만 훑을 때는 쓸모가 있다.
 */
export function selectFamilies(families: readonly PhotoFamily[], notes: readonly PhotoFamilyNote[],
  { q, big, axis }: { q?: string; big?: string; axis?: string }, nameOf: (f: PhotoFamily) => string = () => "") {
  const needle = (q ?? "").trim();
  return families.filter((f) =>
    (!big || f.big === big)
    && (!axis || f.axes.some(([a]) => a === axis))
    && (!needle || nameOf(f).includes(needle) || (noteFor(f, notes)?.note ?? "").includes(needle) || f.members.some((m) => m.includes(needle)) || f.guests.some((g) => g.head.includes(needle))));
}

/** 큰 무드마다 가족 수 · 묶음 수 · 검색어 수. 가족은 큰 무드 하나에만 든다. */
export function moodTally(data: PhotoFamilies) {
  const by = new Map(data.families.map((f) => [f.id, f]));
  return data.moods.map((m) => {
    const fams = m.families.map((id) => by.get(id)).filter((f): f is PhotoFamily => !!f);
    return { id: m.id, families: fams.length, groups: fams.reduce((n, f) => n + f.members.length, 0), terms: fams.reduce((n, f) => n + f.terms, 0) };
  });
}

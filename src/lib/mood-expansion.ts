// 무드 검색 넓히기 — 순수 로직 (docs/40 §16-2 7번 · §17-7, 2026-10-01).
//
// 무드 말("노을")의 태그 직접 일치가 모자라면 무드 층을 타고 넓힌다:
//   같은 묶음(D2, 바꿔 써도 같은 말) → 같은 무리(D3, 거의 같은 말) → 같은 가족(D4) → 이웃 → 같은 큰 무드(D5)
// 묶음 · 무리는 같은 말이라 늘 넣는다. 가족 · 이웃은 모자란 만큼만(EXPAND_UNTIL 장까지) 채우고 멈춘다.
// **큰 무드는 태그로는 넓히지 않는다** — 묶음 484곳에서 사진 5.3만 건이 걸려(실측 2026-10-01) 무드가 묻힌다.
// **흔한 태그는 넓힐 때 쓰지 않는다** — 사진 태그는 228종뿐이고 감성 556 · 핀터레스트 393 · 일본무드 281 처럼 몇 개가
// 수백 장에 붙어 있다. 넓힌 말에 그게 하나 끼면 그 사진이 몰려온다("청량" → 일본무드 281장). 이웃 그래프의 허브를
// 낮춘 것과 같은 이유다. 사람이 그 말을 직접 검색하면 직접 일치로 그대로 나온다.
//
// 넓힌 말은 사진 태그(mood_tags · generated_tags)와 **정확히 같을 때만** 맞춘다. 부분 일치를 허용하면
// "눈" 이 눈물 · 눈부신 에 걸린다. 앨범 글 · 작가 태그는 보지 않는다 — 넓힌 말은 원래 검색어가 아니다.
//
// 표는 build_mood_search_map.py 가 굳힌다(mood-search-map.json). 이 파일은 그 표만 읽는다.
import map from "./mood-search-map.json" with { type: "json" };

export type MoodSearchMap = {
  heads: string[];
  terms: Record<string, number>;
  words: string[][];
  cluster: number[][];
  family: number[];
  families: number[][];
  big: number[];
  moods: number[][];
  near: number[][];
};

export const MOOD_TIERS = ["묶음", "무리", "가족", "이웃", "큰 무드"] as const;
export type MoodTier = (typeof MOOD_TIERS)[number];

/** 넓히기를 멈추는 장수 — 묶음 · 무리 일치가 이보다 적으면 가족부터 이만큼 찰 때까지 채운다(48장 묶음 두 개) */
export const EXPAND_UNTIL = 96;
/** 태그로 넓히는 가장 먼 층 — 이웃까지(큰 무드는 너무 넓다) */
const LAST_TAG_TIER = MOOD_TIERS.indexOf("이웃");
/** 이만큼 흔한 태그는 가족부터의 층에서 쓰지 않는다 — 사진의 8% 넘게 · 20장 이상 */
const COMMON_SHARE = 0.08;
const COMMON_MIN = 20;

const MAP = map as MoodSearchMap;

/** search-metadata-core.ts 의 normalizeMetadataText 와 같다 — 표의 terms 키도 이 꼴로 굳혔다 */
export function normMoodWord(value: string): string {
  return value.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}ㄱ-ㅎㅏ-ㅣ]+/gu, "");
}

/** 꼬리말을 떼어 다시 찾는다 — "몽환적인" → 몽환적 · 몽환, "청량한" → 청량. 긴 것부터 */
const TAILS = ["스러운", "스런", "적인", "느낌", "감성", "분위기", "무드", "사진", "적", "한"];

function findBundle(word: string, m: MoodSearchMap): number | null {
  const key = normMoodWord(word);
  if (!key) return null;
  if (key in m.terms) return m.terms[key];
  for (const tail of TAILS) {
    if (key.length > tail.length + 1 && key.endsWith(tail)) {
      const stem = key.slice(0, -tail.length);
      if (stem in m.terms) return m.terms[stem];
    }
  }
  return null;
}

/**
 * 무드 글에서 묶음을 찾는다. 글 전체가 한 묶음이면 그것("비 오는 날"), 아니면 낱말마다.
 * 묶음에 없는 낱말은 버린다 — 넓히기는 아는 말에만 한다.
 */
export function findMoodBundles(moodText: string, m: MoodSearchMap = MAP): number[] {
  const whole = findBundle(moodText, m);
  if (whole !== null) return [whole];
  const found = moodText.split(/\s+/).map((word) => findBundle(word, m)).filter((id): id is number => id !== null);
  return [...new Set(found)];
}

/** 한 묶음의 층별 말 — 앞 층에 나온 묶음은 뒤 층에서 뺀다. [층 이름, 말 목록] 순서대로 */
export function moodTiers(bundle: number, m: MoodSearchMap = MAP): { tier: MoodTier; words: string[] }[] {
  const seen = new Set([bundle]);
  const take = (ids: number[]) => {
    const fresh = ids.filter((id) => !seen.has(id));
    fresh.forEach((id) => seen.add(id));
    return fresh.flatMap((id) => m.words[id]);
  };
  const family = m.family[bundle];
  const inBig = m.moods[m.big[family]].flatMap((f) => m.families[f]);
  return [
    { tier: "묶음", words: m.words[bundle] },
    { tier: "무리", words: take(m.cluster[bundle]) },
    { tier: "가족", words: take(m.families[family]) },
    { tier: "이웃", words: take(m.near[bundle]) },
    { tier: "큰 무드", words: take(inBig) },
  ];
}

export type TaggedPhoto = { id: string; mood_tags?: string[] | null; generated_tags?: string[] | null };

/**
 * 사진을 무드 층 순서로 줄 세운다(이웃까지). 무드 낱말이 여럿이면 사진이 **모든 낱말**에 어느 층으로든 맞아야 하고,
 * 그 사진의 층은 낱말마다의 층 중 가장 먼 것이다. 같은 층 안에서는 드문 태그로 맞은 사진이 먼저(맞은 태그의 희소도 합),
 * 같으면 받은 순서. 가족부터의 층은 흔한 태그(COMMON_SHARE)로는 맞추지 않는다 — 흔한지는 받은 사진들로 센다.
 *
 * exclude — 이미 나온 사진(태그 직접 일치)은 뺀다. 가족부터의 층은 모두 합쳐 room 장까지만.
 */
export function rankByMoodTiers<T extends TaggedPhoto>(
  photos: readonly T[],
  bundles: readonly number[],
  { exclude, room, m = MAP }: { exclude?: ReadonlySet<string>; room: number; m?: MoodSearchMap },
): { photo: T; tier: MoodTier }[] {
  if (!bundles.length) return [];
  const tagsOf = photos.map((photo) =>
    new Set([...(photo.mood_tags ?? []), ...(photo.generated_tags ?? [])].map(normMoodWord).filter(Boolean)));
  const df = new Map<string, number>();
  for (const tags of tagsOf) for (const tag of tags) df.set(tag, (df.get(tag) ?? 0) + 1);
  const common = (tag: string) => (df.get(tag) ?? 0) >= Math.max(COMMON_MIN, photos.length * COMMON_SHARE);
  const rarity = (tag: string) => Math.log((photos.length + 1) / ((df.get(tag) ?? 0) + 1));

  const tiers = bundles.map((b) => moodTiers(b, m).slice(0, LAST_TAG_TIER + 1).map((t, level) =>
    new Set(t.words.map(normMoodWord).filter((word) => level <= 1 || !common(word)))));

  const scored: { photo: T; tier: number; rare: number; index: number }[] = [];
  photos.forEach((photo, index) => {
    if (exclude?.has(photo.id)) return;
    const tags = tagsOf[index];
    if (!tags.size) return;
    let worst = 0;
    let rare = 0;
    for (const levels of tiers) {
      const level = levels.findIndex((words) => [...tags].some((tag) => words.has(tag)));
      if (level < 0) return;                                              // 이 낱말에는 어느 층으로도 안 맞는다
      worst = Math.max(worst, level);
      for (const tag of tags) if (levels[level].has(tag)) rare += rarity(tag);
    }
    scored.push({ photo, tier: worst, rare, index });
  });
  scored.sort((a, b) => a.tier - b.tier || b.rare - a.rare || a.index - b.index);

  const always = scored.filter((s) => s.tier <= 1);                       // 묶음 · 무리 — 같은 말이라 늘
  const wider = scored.filter((s) => s.tier > 1).slice(0, Math.max(0, room - always.length));
  return [...always, ...wider].map((s) => ({ photo: s.photo, tier: MOOD_TIERS[s.tier] }));
}

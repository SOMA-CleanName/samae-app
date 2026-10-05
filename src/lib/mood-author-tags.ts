// 작가가 직접 쓴 무드 단어 — 사진 태그(photos.mood_tags, 포트폴리오를 올릴 때 칩으로 입력)와 작가 프로필 태그
// (photographers.mood_tags). 자동으로 붙는 auto_mood_tags 는 넣지 않는다. DB 는 읽기만 한다.

export type AuthorTagPhoto = { photographer_id: string | null; mood_tags: string[] | null };
export type AuthorTagProfile = { id: string; mood_tags: string[] | null };

export type AuthorTag = {
  label: string;
  /** 이 태그를 단 사진 수 */
  photos: number;
  /** 사진이나 프로필에 이 태그를 쓴 작가 수 */
  photographers: number;
  /** 프로필에 쓴 작가 수 */
  profiles: number;
  /** 1차 전처리 무드에 들어 있나 */
  inScreen: boolean;
};

export const normTag = (tag: string) => tag.normalize("NFKC").trim().replace(/\s+/gu, " ");

/** 같은 태그는 NFKC · 공백 정리 후 하나로 센다. 한 사진에 같은 태그가 두 번이면 한 번. */
export function summarizeAuthorTags(photos: readonly AuthorTagPhoto[], profiles: readonly AuthorTagProfile[], screen: Set<string>) {
  const rows = new Map<string, { photos: number; who: Set<string>; profiles: number }>();
  const row = (label: string) => {
    let r = rows.get(label);
    if (!r) rows.set(label, (r = { photos: 0, who: new Set(), profiles: 0 }));
    return r;
  };
  for (const photo of photos) {
    for (const label of new Set((photo.mood_tags ?? []).map(normTag).filter(Boolean))) {
      const r = row(label);
      r.photos += 1;
      if (photo.photographer_id) r.who.add(photo.photographer_id);
    }
  }
  for (const profile of profiles) {
    for (const label of new Set((profile.mood_tags ?? []).map(normTag).filter(Boolean))) {
      const r = row(label);
      r.profiles += 1;
      r.who.add(profile.id);
    }
  }
  return [...rows].map(([label, r]): AuthorTag => ({
    label, photos: r.photos, photographers: r.who.size, profiles: r.profiles,
    inScreen: screen.has(label) || screen.has(label.replace(/ /g, "")),
  })).sort((a, b) => b.photos - a.photos || b.photographers - a.photographers || a.label.localeCompare(b.label, "ko"));
}

/** 검색 · "1차 전처리 무드에 없는 것만" 으로 거른다 */
export function selectAuthorTags(rows: readonly AuthorTag[], { q, missing }: { q: string; missing: boolean }) {
  const needle = q.trim();
  return rows.filter((r) => (!needle || r.label.includes(needle)) && (!missing || !r.inScreen));
}

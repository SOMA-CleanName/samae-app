export type MoodPhoto = { id: string; mood_tags: string[] | null; auto_mood_tags: string[] | null };
export function summarizeMoodUsage(photos: MoodPhoto[]) {
  const usage = new Map<string, { label: string; photos: number; manual: number; auto: number }>();
  let taggedPhotos = 0;
  const seen = new Set<string>();
  for (const photo of photos) {
    if (seen.has(photo.id)) continue;
    seen.add(photo.id);
    const clean = (values: string[] | null) => new Set((values ?? [])
      .map((v) => v.normalize("NFKC").trim().replace(/\s+/gu, " ")).filter(Boolean));
    const manual = clean(photo.mood_tags), auto = clean(photo.auto_mood_tags);
    const labels = new Set([...manual, ...auto]);
    if (labels.size) taggedPhotos++;
    for (const label of labels) {
      const row = usage.get(label) ?? { label, photos: 0, manual: 0, auto: 0 };
      row.photos++;
      if (manual.has(label)) row.manual++;
      if (auto.has(label)) row.auto++;
      usage.set(label, row);
    }
  }
  return { usage, taggedPhotos, totalPhotos: seen.size, untaggedPhotos: seen.size - taggedPhotos };
}

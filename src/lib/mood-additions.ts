// 사전 밖 무드 표현(docs/40 §17)의 순수 로직. 파일 입출력은 mood-additions-data.ts 에 있다.
// 새 어휘는 한국어기초사전 표제어에서만 뽑아 힙한 · 필름 감성 · 역광의 같은 말이 빠졌다. 그걸 모아 보여 준다.

export type AdditionSource = "shortlisted" | "generated" | "photo-tags";
export type Addition = {
  label: string;
  axes: string[];
  kind: string;
  sources: AdditionSource[];
  usage: string;
  prompt?: string;
  /** 기존 사진 태그로 쓰인 사진 수 — 화면에서 채운다 */
  photos?: number;
};

export const normLabel = (label: string) => label.normalize("NFKC").trim().replace(/\s+/gu, " ");

/**
 * 파일에 모은 표현 + 기존 사진 태그 중 새 어휘에 없는 것.
 * 사진 태그는 DB 를 읽어야 해서 파일에 없고, 화면이 열릴 때 더한다. 같은 표현이면 하나로 합친다.
 */
export function mergeAdditions(entries: Addition[], photoTags: Map<string, number>, known: Set<string>) {
  const out = new Map<string, Addition>();
  for (const e of entries) out.set(normLabel(e.label), { ...e, sources: [...e.sources] });
  for (const [raw, photos] of photoTags) {
    const label = normLabel(raw);
    if (!label || known.has(label)) continue;
    const e = out.get(label) ?? { label, axes: [], kind: "기타", sources: [], usage: "" };
    if (!e.sources.includes("photo-tags")) e.sources.push("photo-tags");
    e.photos = photos;
    out.set(label, e);
  }
  for (const [label, e] of out) if (e.photos === undefined) e.photos = photoTags.get(label) ?? 0;
  return [...out.values()].sort((a, b) => (b.photos ?? 0) - (a.photos ?? 0) || a.label.localeCompare(b.label, "ko"));
}

export function selectAdditions(rows: Addition[], { q, source, axis }: { q: string; source: string; axis: string }) {
  const needle = q.trim();
  return rows.filter((r) =>
    (!source || r.sources.includes(source as AdditionSource))
    && (!axis || r.axes.includes(axis))
    && (!needle || r.label.includes(needle) || r.usage.includes(needle)));
}

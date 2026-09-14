export const PURPOSE_OPTIONS = [
  { key: "personal", label: "개인" },
  { key: "couple", label: "커플" },
  { key: "friendship", label: "우정" },
  { key: "wedding", label: "웨딩" },
  { key: "pet", label: "반려동물" },
  { key: "commercial", label: "상업/브랜드" },
  { key: "event", label: "행사" },
] as const;

export type PurposeKey = (typeof PURPOSE_OPTIONS)[number]["key"];

const PURPOSE_KEYS = new Set<string>(
  PURPOSE_OPTIONS.map((option) => option.key),
);

export function isPurposeKey(value: unknown): value is PurposeKey {
  return typeof value === "string" && PURPOSE_KEYS.has(value);
}

export function purposeLabel(key: PurposeKey): string {
  return PURPOSE_OPTIONS.find((option) => option.key === key)!.label;
}

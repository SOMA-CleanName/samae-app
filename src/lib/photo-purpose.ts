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

/** 배열이 없는 기존 행만 단일 목적에서 복원한다. 빈 배열은 미분류다. */
export function normalizePurposes(value: unknown, legacy?: PurposeKey | null): PurposeKey[] {
  return Array.isArray(value)
    ? [...new Set(value.filter(isPurposeKey))]
    : legacy ? [legacy] : [];
}

export function parsePurposeSelection(value: unknown): PurposeKey[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isPurposeKey)) {
    throw new Error("사진 목적을 한 개 이상 선택해주세요.");
  }
  return [...new Set(value)];
}

export function togglePurpose(selected: readonly PurposeKey[], purpose: PurposeKey): PurposeKey[] {
  return selected.includes(purpose)
    ? selected.filter((item) => item !== purpose)
    : [...selected, purpose];
}

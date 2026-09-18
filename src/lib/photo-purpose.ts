import detailTaxonomy from "./purpose-details.json" with { type: "json" };

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

// ── 개인 목적 안의 성별 (0132) ────────────────────────────────────────────
// 개인 사진에만 붙는다. 커플·웨딩 사진에는 두 성별이 다 있어 성별을 묻지 않는다(docs/39 §3.2).

export const GENDER_OPTIONS = [
  { key: "female", label: "여성" },
  { key: "male", label: "남성" },
] as const;

export type PurposeGender = (typeof GENDER_OPTIONS)[number]["key"];
export type GenderSource = "auto" | "manual" | null;

export function isPurposeGender(value: unknown): value is PurposeGender {
  return value === "female" || value === "male";
}

export function genderLabel(key: PurposeGender): string {
  return GENDER_OPTIONS.find((option) => option.key === key)!.label;
}

/** 성별은 개인 목적이 있을 때만 산다. 개인이 없으면 무엇을 넘겨도 null 이다. */
export function genderFor(purposes: readonly PurposeKey[], gender: PurposeGender | null | undefined): PurposeGender | null {
  return purposes.includes("personal") && isPurposeGender(gender) ? gender : null;
}

/** 서버로 넘어온 값 검사 — null(지정 안 함)과 여성·남성만 받는다. */
export function parseGenderSelection(value: unknown): PurposeGender | null {
  if (value === null) return null;
  if (!isPurposeGender(value)) throw new Error("성별은 여성 또는 남성만 선택할 수 있습니다.");
  return value;
}

/** 목적 칩 이름 — 개인에 성별이 있으면 "개인·여성". */
export function purposeChipLabel(purpose: PurposeKey, gender: PurposeGender | null): string {
  return purpose === "personal" && gender ? `${purposeLabel(purpose)}·${genderLabel(gender)}` : purposeLabel(purpose);
}

// ── 목적 세부분류 (0133) ─────────────────────────────────────────────────
// 체계는 purpose-details.json 한 곳에 있다 — 검색어 분리기(Python)도 같은 파일을 읽는다.
// 값은 "목적.세부"(예: event.maternity). 그 목적이 있을 때만 산다. 한 목적 안에서 여러 개 가능(docs/39 §3).


export type PurposeDetailOption = { key: string; label: string; value: string };

export const PURPOSE_DETAILS: Record<PurposeKey, PurposeDetailOption[]> = Object.fromEntries(
  PURPOSE_OPTIONS.map(({ key }) => [
    key,
    ((detailTaxonomy as unknown as Record<string, Array<{ key: string; label: string }>>)[key] ?? []).map((item) => ({
      key: item.key,
      label: item.label,
      value: `${key}.${item.key}`,
    })),
  ]),
) as Record<PurposeKey, PurposeDetailOption[]>;

const DETAIL_LABELS = new Map(
  Object.values(PURPOSE_DETAILS).flat().map((option) => [option.value, option.label]),
);

export function isPurposeDetail(value: unknown): value is string {
  return typeof value === "string" && DETAIL_LABELS.has(value);
}

export function detailLabel(detail: string): string {
  return DETAIL_LABELS.get(detail) ?? detail;
}

export function detailPurpose(detail: string): PurposeKey | null {
  const purpose = detail.split(".")[0];
  return isPurposeKey(purpose) ? purpose : null;
}

/** 목적에 속한 세부분류만, 순서대로 한 번씩. 목적이 빠진 세부분류는 버린다(DB 트리거와 같다). */
export function detailsFor(purposes: readonly PurposeKey[], details: readonly unknown[] | null | undefined): string[] {
  const kept = (details ?? []).filter(
    (detail): detail is string => isPurposeDetail(detail) && purposes.includes(detailPurpose(detail)!),
  );
  return [...new Set(kept)];
}

/** 서버로 넘어온 값 검사 — 알려진 세부분류 키만 받는다. 빈 배열은 "지정 안 함". */
export function parseDetailSelection(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(isPurposeDetail)) {
    throw new Error("알 수 없는 세부분류입니다.");
  }
  return [...new Set(value)];
}

export function toggleDetail(selected: readonly string[], detail: string): string[] {
  return selected.includes(detail) ? selected.filter((item) => item !== detail) : [...selected, detail];
}

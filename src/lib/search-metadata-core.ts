function normalizeMetadataText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}ㄱ-ㅎㅏ-ㅣ]+/gu, "");
}

/** 다단어 자연어가 일부 흔한 단어만 맞아 SigLIP 앞을 덮지 않게 원문 단어를 모두 확인한다. */
export function matchesDirectPhotoMetadata(
  rawQuery: string,
  values: Array<string | null | undefined>
): boolean {
  const terms = rawQuery
    .trim()
    .slice(0, 40)
    .split(/\s+/)
    .map(normalizeMetadataText)
    .filter(Boolean);
  if (terms.length === 0) return false;

  const targets = values
    .filter((value): value is string => Boolean(value))
    .map(normalizeMetadataText)
    .filter(Boolean);
  return terms.every((term) => targets.some((target) => target.includes(term)));
}

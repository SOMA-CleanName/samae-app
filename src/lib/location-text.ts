// 사진의 촬영 장소 표기(`photos.location_text`)를 읽을 때 쓰는 판정.
//
// 이 칸은 **작가가 자유롭게 적는다.** 그래서 실제로 이런 값들이 들어와 있다
// (2026-09-27, 공개 사진 1,000장 기준):
//
//     협의 64장 · 서울 어딘가 32 · 스튜디오 협의 28 · 수도권 내 협의 후 진행 14
//     공원 48 · 스튜디오 13 · 서울 11          ← 장소라기엔 너무 넓다
//     소희재스튜디오 15 / 소희재 스튜디오. 13   ← 같은 곳인데 표기가 갈라졌다
//
// 이게 왜 문제냐면 —
//   · 사진 지면에 **「촬영 장소: 협의」** 라고 적힌다. 정보가 아니라 잡음이다
//   · 스팟(`lib/spots`)이 `location_text` 매칭으로 사진을 모으는데 이 값들은 아무 데도
//     안 붙는다. 최소 150장이 장소 정보를 사실상 버리고 있었다
//   · 같은 곳이 표기만 달라 갈라지면 **둘 다 9장 기준에 미달**한다. 합치면 넘는데도
//
// ⚠️ **작가가 적은 값을 고치지 않는다.** 여기 있는 건 읽는 쪽의 판정뿐이다. 작가의
//    입력을 우리가 덮어쓰면 다음 수정 때 작가가 "내가 쓴 게 왜 바뀌었지" 가 된다.

/** 장소가 아니라 "나중에 정한다" 는 말 */
const NEGOTIABLE = ["협의", "상의", "추후", "별도 안내", "별도 장소 안내", "미정", "어디든", "문의"];

/**
 * 장소 이름이라기엔 너무 넓은 말. 이것만 적혀 있으면 어디인지 알 수 없다.
 * ⚠️ **포함(include)이 아니라 정확히 같을 때만** 본다 — "서울" 을 포함으로 막으면
 *    "서울숲" 까지 걸린다.
 */
const TOO_BROAD = new Set([
  "서울", "경기", "인천", "부산", "대구", "대전", "광주", "울산", "제주", "수도권",
  "전국", "지방", "공원", "스튜디오", "야외", "실내", "카페", "골목", "바다", "산",
]);

/**
 * 표기를 맞춘다 — 같은 곳이 갈라지지 않게.
 *
 * 공백을 하나로, 앞뒤 구두점을 떼고, 가운데 공백은 없앤다.
 * `소희재스튜디오` 와 `소희재 스튜디오.` 가 같은 값이 된다.
 */
export function canonicalPlace(text: string | null | undefined): string {
  return (text ?? "")
    .trim()
    .replace(/[.,·・]+$/u, "")
    .replace(/\s+/gu, "")
    .toLowerCase();
}

/**
 * 이 표기를 **장소로 쓸 수 있는가.**
 *
 * 쓸 수 없으면 사진 지면에 장소를 적지 않고, 스팟 매칭에서도 세지 않는다.
 * 없는 걸 비워 두는 것이지 지우는 게 아니다 — 작가의 입력은 그대로 남는다.
 */
export function isUsablePlace(text: string | null | undefined): boolean {
  const raw = (text ?? "").trim();
  if (raw.length < 2) return false;

  // "협의", "수도권 내 협의 후 진행" 처럼 **어딘가에** 들어 있으면 장소가 아니다
  if (NEGOTIABLE.some((w) => raw.includes(w))) return false;

  // "서울 어딘가" 류 — 넓은 지명 + 얼버무리는 말
  if (/어딘가|근처 어디|아무 데/u.test(raw)) return false;

  return !TOO_BROAD.has(canonicalPlace(raw));
}

/** 화면에 적을 장소. 쓸 수 없는 표기면 null — 「촬영 장소: 협의」 를 적지 않는다 */
export function displayPlace(text: string | null | undefined): string | null {
  const raw = (text ?? "").trim();
  return isUsablePlace(raw) ? raw : null;
}

/**
 * 같은 곳끼리 묶는다 — 어느 장소에 사진이 몇 장인지 세려고.
 *
 * 대표 표기는 **가장 많이 쓰인 원문**으로 고른다. 우리가 이름을 만들어 붙이면
 * 작가가 적은 적 없는 이름이 지면에 뜬다.
 */
export function groupPlaces(
  texts: ReadonlyArray<string | null | undefined>
): Array<{ name: string; count: number; variants: string[] }> {
  const buckets = new Map<string, Map<string, number>>();
  for (const t of texts) {
    if (!isUsablePlace(t)) continue;
    const raw = (t ?? "").trim();
    const key = canonicalPlace(raw);
    const seen = buckets.get(key) ?? new Map<string, number>();
    seen.set(raw, (seen.get(raw) ?? 0) + 1);
    buckets.set(key, seen);
  }
  return [...buckets.values()]
    .map((seen) => {
      const variants = [...seen.entries()].sort((a, b) => b[1] - a[1]);
      return {
        name: variants[0][0],
        count: variants.reduce((s, [, n]) => s + n, 0),
        variants: variants.map(([v]) => v),
      };
    })
    .sort((a, b) => b.count - a.count);
}

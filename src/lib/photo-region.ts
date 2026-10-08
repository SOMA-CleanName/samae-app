// 사진의 지역(photos.region) — 작가가 적은 장소 메모와 붙은 촬영 장소에서 광역 시·도를 뽑는다.
//
// photos.region 은 만들어만 두고 전부 비어 있었다(2026-08-31 확인). 작가는 장소를 자유 텍스트
// (location_text)로만 적는다. 「서울」 처럼 장소라기엔 넓은 말만 적힌 사진은 촬영 장소(spots)에
// 붙일 수 없어서 장소 정보가 그냥 버려지고 있었다 — 그걸 지역으로 남긴다(2026-10-06 결정).
//
// ⚠️ 작가가 적은 location_text 는 고치지 않는다. 비어 있는 region 만 채운다.
// `server-only` 가 아닌 건 테스트 때문이다(lib/spot-match 와 같은 방식).

/** 광역 시·도 — 저장하는 이름과, 메모에서 알아보는 표기들 */
const REGIONS: Array<{ name: string; aliases: string[] }> = [
  { name: "서울", aliases: ["서울"] },
  { name: "부산", aliases: ["부산"] },
  { name: "대구", aliases: ["대구"] },
  { name: "인천", aliases: ["인천"] },
  { name: "광주", aliases: ["광주광역시"] }, // 「광주」 만으론 경기 광주시와 갈린다 — 광역시 표기만 본다
  { name: "대전", aliases: ["대전"] },
  { name: "울산", aliases: ["울산"] },
  { name: "세종", aliases: ["세종시", "세종특별"] }, // 「세종」 은 세종문화회관 · 세종대로가 서울이다
  { name: "경기", aliases: ["경기"] },
  { name: "강원", aliases: ["강원"] },
  { name: "충북", aliases: ["충북", "충청북도"] },
  { name: "충남", aliases: ["충남", "충청남도"] },
  { name: "전북", aliases: ["전북", "전라북도"] },
  { name: "전남", aliases: ["전남", "전라남도"] },
  { name: "경북", aliases: ["경북", "경상북도"] },
  { name: "경남", aliases: ["경남", "경상남도"] },
  { name: "제주", aliases: ["제주"] },
];

const NAMES = new Set(REGIONS.map((r) => r.name));

/** 메모에 적힌 광역 시·도들 */
export function regionsInText(text: string | null | undefined): string[] {
  if (!text) return [];
  return REGIONS.filter((r) => r.aliases.some((a) => text.includes(a))).map((r) => r.name);
}

/**
 * 사진 하나의 지역.
 *
 * 메모에 적힌 시·도 + 붙은 촬영 장소의 시·도(spots.city)를 모아 **딱 하나일 때만** 정한다.
 * 둘 이상(「서울, 경기」 · 「수도권」)이면 어디라고 할 수 없어 비워 둔다 — 틀린 지역보다 빈칸이 낫다.
 */
export function deriveRegion(
  locationText: string | null | undefined,
  linkedSpotCities: string[] = []
): string | null {
  const found = new Set([
    ...regionsInText(locationText),
    ...linkedSpotCities.filter((c) => NAMES.has(c)),
  ]);
  return found.size === 1 ? [...found][0] : null;
}

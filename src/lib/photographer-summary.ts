// 작가 프로필을 **한 문장으로** — 검색·AI 가 인용할 수 있는 형태.
//
// 지면에 지역·무드가 **칩(태그)으로만** 있었다. 사람에겐 충분하지만 검색엔진과 AI 는
// 인용할 문장이 없다 — "서울" "#감성" 같은 조각은 답변에 못 쓴다. 실측(2026-09-26)에서
// 작가 지면 본문이 61단어였고, 사이트맵의 가장 큰 축인데도 그랬다.
//
// ⚠️ **없는 사실을 만들지 않는다.** 지역이 없으면 지역 절을 빼고, 가격이 없으면 가격을
//    말하지 않는다. 문장을 채우려고 "다양한 지역에서" 같은 말을 넣으면 그건 우리가
//    지어낸 것이고, AI 가 그걸 사실로 인용한다.

export type SummaryInput = {
  regions?: string[] | null;
  moodTags?: string[] | null;
  /** 활성 패키지 수 */
  packageCount?: number;
  /** 가장 싼 패키지 가격(원). 가격 없는 작가는 null */
  minPriceKrw?: number | null;
};

/** 12만원 / 8만 5천원처럼 말하지 않고, 읽기 쉬운 만원 단위로 끊는다 */
function krw(n: number): string {
  if (n >= 10000 && n % 10000 === 0) return `${n / 10000}만원`;
  return `${n.toLocaleString("ko-KR")}원`;
}

/**
 * 한국어 나열 — 셋까지만. 넷 이상이면 `등` 을 붙여 줄인다.
 *
 * "외 2" 로 적었더니 문장 안에서 **"감성 외 2 무드의 사진"** 처럼 읽혔다. 숫자를
 * 문장 한가운데 넣으면 목록을 세는 말이 되지 문장이 되지 않는다. `등` 은 "더 있다" 를
 * 말하면서 문장을 깨지 않는다 — 사실도 그대로다.
 */
function list(items: string[], max = 3): string {
  const clean = items.map((s) => s.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length <= max) return clean.join(" · ");
  return `${clean.slice(0, max).join(" · ")} 등`;
}

/**
 * 프로필 요약 문장. **말할 게 없으면 빈 문자열을 돌려준다** — 빈 문단을 지면에
 * 세우느니 아예 안 세우는 게 낫다.
 */
export function photographerSummary(input: SummaryInput): string {
  const regions = list(input.regions ?? []);
  const moods = list(input.moodTags ?? []);
  const parts: string[] = [];

  if (regions && moods) parts.push(`${regions}에서 ${moods} 무드로 촬영합니다.`);
  else if (regions) parts.push(`${regions}에서 촬영합니다.`);
  else if (moods) parts.push(`${moods} 무드로 촬영합니다.`);

  const n = input.packageCount ?? 0;
  if (n > 0) {
    const price = input.minPriceKrw && input.minPriceKrw > 0 ? `${krw(input.minPriceKrw)}부터` : null;
    parts.push(price ? `촬영 패키지 ${n}종, ${price} 예약할 수 있어요.` : `촬영 패키지 ${n}종이 있어요.`);
  }

  return parts.join(" ");
}

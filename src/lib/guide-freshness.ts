// 안내가 최신인가 — 무엇이 언제 바뀌었는지로 판단한다.
//
// 안내 이미지와 챗봇은 **저장된 KB 카드의 스냅샷**이다. 작가가 패키지 금액을 고쳐도
// 카드는 그대로고, 카드를 고쳐도 이미 구운 이미지는 그대로다. 지금은 그게 어긋난 걸
// 알 방법이 없어서, 고객이 프로필에서 옛 금액을 보고 있어도 아무도 모른다.
//
// 어긋남은 두 가지고 **고치는 방법이 다르다.**
//   · cards  — 패키지·소개글이 카드보다 최신. 운영이 자료를 다시 읽어 카드를 고쳐야 한다
//   · images — 카드가 발행된 이미지보다 최신. [이미지 발행] 한 번이면 끝난다
//
// 둘 다면 cards 가 먼저다 — 카드를 고치지 않고 다시 구우면 옛 내용이 그대로 다시 나간다.

export type FreshnessInput = {
  /** photographer_bot_kb.updated_at */
  kbUpdatedAt: string | null;
  /** 그 작가 패키지들의 가장 최근 updated_at */
  packagesUpdatedAt: string | null;
  /** photographers.updated_at (소개글·최저가 등) */
  profileUpdatedAt: string | null;
  /** 우리가 구운 안내 이미지 중 가장 최근 created_at */
  imagesBuiltAt: string | null;
};

export type Freshness = {
  state: "none" | "fresh" | "images" | "cards";
  /** 화면에 그대로 쓸 한 줄 */
  label: string | null;
};

const ms = (s: string | null) => (s ? Date.parse(s) : NaN);

/**
 * 시계 오차·같은 저장 흐름에서 생기는 몇 초 차이를 어긋남으로 보지 않는다.
 * KB 를 저장하고 바로 굽는 경로가 있어서, 이걸 0 으로 두면 방금 발행한 것도 "옛 이미지" 가 된다.
 */
const SLACK_MS = 60_000;

function newer(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && a - b > SLACK_MS;
}

export function checkFreshness(input: FreshnessInput): Freshness {
  const kb = ms(input.kbUpdatedAt);
  if (!Number.isFinite(kb)) return { state: "none", label: null };

  // 패키지·프로필 중 하나라도 카드보다 최신이면 카드부터 고쳐야 한다
  const source = Math.max(
    Number.isFinite(ms(input.packagesUpdatedAt)) ? ms(input.packagesUpdatedAt) : -Infinity,
    Number.isFinite(ms(input.profileUpdatedAt)) ? ms(input.profileUpdatedAt) : -Infinity
  );
  if (newer(source, kb)) {
    return { state: "cards", label: "패키지·프로필이 카드보다 최신 — 카드를 다시 정리해야 해요" };
  }

  const built = ms(input.imagesBuiltAt);
  // 카드는 있는데 이미지를 한 번도 안 구웠으면 그것도 "이미지가 옛것" 쪽이다
  if (!Number.isFinite(built)) return { state: "images", label: "아직 이미지를 만들지 않았어요" };
  if (newer(kb, built)) return { state: "images", label: "카드가 바뀌었어요 — 이미지를 다시 만들어주세요" };

  return { state: "fresh", label: null };
}

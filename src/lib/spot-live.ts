// 촬영 장소를 **지금 보여줄 수 있는가**.
//
// `spots.published` 는 운영자가 "켜 두기로 했다" 는 뜻이지 "지금 보여줄 게 있다" 는
// 뜻이 아니다. 둘을 같은 값으로 쓰면 사진이 빠져나갈 때 **빈 지면이 그대로 서 있는다.**
//
// 스팟은 FK 가 아니라 `location_text` 매칭이라(lib/spots) 사진이 사라져도 아무 신호가
// 없다. 갤러리가 조용히 줄어들 뿐이다. 실제로 2026-09-26 기준 공개 스팟 18곳 중
// 경복궁(2장)·망원한강(8장)이 기준 미달인 채 공개돼 있었다 — 켤 때 사람이 한 번
// 확인한 뒤로 아무도 다시 안 본 것이다.
//
// 그래서 `published` 를 끄지 않는다. **운영자의 의도는 그대로 두고, 보여줄지 말지는
// 매번 사진 수로 정한다.** 사진이 다시 차면 손대지 않아도 돌아온다.

/**
 * 장소 지면을 세우는 최소 장수.
 *
 * 운영자가 스팟을 켜는 기준(docs·어드민 문구·lib/spots-db 주석)과 같은 숫자다 —
 * "그 장소에서 실제로 찍힌 공개 사진이 9장 이상". 켤 때의 기준과 계속 보여줄 기준이
 * 다르면 그 차이만큼 빈 지면이 남는다.
 */
export const SPOT_MIN_PHOTOS = 9;

/** 지금 이 장소를 고객에게 보여줄 수 있는가 */
export function isSpotLive(photoCount: number): boolean {
  return photoCount >= SPOT_MIN_PHOTOS;
}

/** 어드민 목록에 띄울 상태 — 운영자가 "왜 안 보이지" 를 묻지 않게 */
export function spotLiveLabel(args: {
  published: boolean;
  photoCount: number;
}): { label: string; tone: "success" | "warning" | "muted" } {
  if (!args.published) return { label: "비공개", tone: "muted" };
  if (!isSpotLive(args.photoCount)) {
    return { label: `사진 부족 (${args.photoCount}/${SPOT_MIN_PHOTOS})`, tone: "warning" };
  }
  return { label: "공개", tone: "success" };
}

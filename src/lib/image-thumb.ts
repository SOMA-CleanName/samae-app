// 이미 있는 썸네일을 가리키게 만든다 — **새로 만들지 않는다.**
//
// 업로드할 때 원본과 함께 500px 썸네일(`<이름>_thumb.<확장자>`)을 같이 굽는다. 그런데
// 그 썸네일이 있는 줄 모르고 **원본 URL 을 그대로 렌더하는 자리들**이 있었다.
//
//   실측 2026-09-18 — `/explore` 한 지면이 이미지만 **17.6MB**.
//   원본 31장 평균 582KB(최대 988KB)인데, 같은 사진의 썸네일은 29~84KB 다. 약 10배.
//   하필 그 자리들이 **74~104px 짜리 카드**였다. 92px 칸에 810KB 를 내려받고 있었다.
//
// ⚠️ **next/image 로 푸는 문제가 아니다.** 이 앱은 `images.unoptimized = true` 다 —
//    홈 한 화면에서 변환 요청이 500개를 넘겨 Vercel 할당량을 태우고 402 로 이미지가
//    무한로딩된 적이 있어서 일부러 끈 것이다(next.config 주석). 그래서 srcset 도 없다.
//    대신 **업로드 때 이미 만들어 둔 썸네일을 제대로 가리키는 것**이 우리 방식이다.
//
// ⚠️ 문자열로 URL 을 만드는 건 원래 조심할 일이라 **아는 모양일 때만** 바꾼다.
//    Supabase Storage 공개 URL 이 아니거나 이미 썸네일이면 받은 값을 그대로 돌려준다.
//    못 바꾸면 원본이 나갈 뿐 화면이 깨지지는 않는다 — 안전한 쪽으로 실패한다.
//
// 📌 사진 레코드에 `thumb_url` 컬럼이 있으면 **그걸 쓰는 게 먼저다.** 이 함수는 URL 만
//    들고 있는 자리(아티클 커버처럼 원본 URL 이 그대로 저장된 곳)를 위한 것이다.

/** Supabase Storage 공개 객체 URL 인가 */
const STORAGE_URL = /\/storage\/v1\/object\/public\//;

/**
 * 원본 URL → 같은 이름의 `_thumb` URL.
 *
 * 바꿀 수 없으면 받은 값을 그대로 돌려준다(null·빈 값 포함).
 */
export function thumbUrl<T extends string | null | undefined>(url: T): T {
  if (!url) return url;
  if (!STORAGE_URL.test(url)) return url;

  // 쿼리스트링·해시는 건드리지 않는다 (서명 URL 등)
  const cut = url.search(/[?#]/);
  const path = cut === -1 ? url : url.slice(0, cut);
  const rest = cut === -1 ? "" : url.slice(cut);

  const dot = path.lastIndexOf(".");
  // 확장자가 없거나 마지막 경로 조각에 없으면 손대지 않는다
  if (dot === -1 || dot < path.lastIndexOf("/")) return url;

  const stem = path.slice(0, dot);
  if (stem.endsWith("_thumb")) return url; // 이미 썸네일
  return `${stem}_thumb${path.slice(dot)}${rest}` as T;
}

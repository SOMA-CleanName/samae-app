// 안내 이미지 상수 — guide-images.ts 는 server-only 라 클라이언트 갤러리가 import 할 수 없다.
// 값 상수만 여기로 뺀다(서버·클라이언트 공용).

/** 사진 상세에서 기본으로 펼쳐 보여줄 장수 — 나머지는 "n장 더 보기"로 접는다 */
export const GUIDE_PREVIEW_COUNT = 2;

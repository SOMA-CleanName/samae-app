// 카카오 동의 화면으로 내보낸 횟수 — **서버가 센다.**
//
// 왜 서버인가. 전에는 보내기 직전에 브라우저가 `document.cookie` 로 "한 번 보냈다" 를
// 심고 서버가 그걸 읽었다. 실측(2026-09-16)에서 그 표시가 **한 번도 안 보였고**, 결과로
// 클릭 한 번에 카카오 왕복이 3회 일어났다. 왕복 하나가 액세스 토큰 발급 1회라
// **사용자당 10분에 20개** 제한(카카오 쿼터 문서)을 금방 태운다. 실제로 태웠고,
// 그 뒤로는 모든 로그인이 `KOE237 token request rate limit exceeded` 로 죽었다.
//
// 그래서 세는 주체를 옮겼다. `/auth/callback` 이 **응답에** 쿠키를 얹으므로
// 다음 요청에 반드시 실려 온다 — 클라이언트가 심고 서버가 읽는 구조에 있던 틈이 없다.
//
// ⚠️ 이 값이 한도에 닿으면 **카카오로 더 보내지 않는다.** 대신 우리 체크박스 폼으로
//    받는다(/signup/consent). 카카오에서 동의가 안 잡히는 이유는 여러 가지인데
//    (간편가입 태그 불일치, service_terms 조회 타임아웃, 애초에 카카오가 안 물어봄),
//    어느 쪽이든 같은 길로 다시 보내면 결과가 같고 쿼터만 탄다.

/** 서버가 심는 시도 횟수 쿠키 */
export const KAKAO_TERMS_TRIES_COOKIE = "samae_kakao_terms_tries";

/** 30분. 한 번의 가입·재동의 시도를 덮기에 충분하고, 하루를 묶어두지도 않는다 */
export const KAKAO_TERMS_TRIES_MAX_AGE = 1800;

/**
 * 카카오로 보낼 수 있는 최대 횟수.
 *
 * 1 인 이유 — 카카오에서 못 받은 동의는 **다시 보내도 거의 안 받아진다.** 원인이
 * 일시적 오류보다 설정·상태 불일치 쪽이어서다. 두 번째부터는 체크박스 폼이 빠르다.
 */
export const KAKAO_TERMS_MAX_TRIES = 1;

/** 쿠키 문자열 → 횟수. 값이 이상하면 0 으로 본다(막지 않는 쪽) */
export function parseKakaoTermsTries(value: string | null | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** 카카오로 더 보내면 안 되는 상태인가 */
export function kakaoTermsExhausted(value: string | null | undefined): boolean {
  return parseKakaoTermsTries(value) >= KAKAO_TERMS_MAX_TRIES;
}

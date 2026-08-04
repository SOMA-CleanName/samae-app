export const TASTE_TEST_NUDGE_COOKIE = "samae_taste_nudge_hidden";
// X·하러가기·테스트 완료 후 같은 브라우저에서 다시 노출하지 않는다.
export const TASTE_TEST_NUDGE_PERSISTENCE_ENABLED = true;
// 운영 동작에서는 기존 완료·숨김 기록을 존중한다.
export const TASTE_TEST_NUDGE_PREVIEW_ENABLED = false;

const NUDGE_HIDDEN_KEY = "samae:taste-test-nudge-dismissed";
const TASTE_RESULT_KEY = "samae:taste-result";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// X, 하러가기, 테스트 완료 중 하나라도 발생하면 같은 브라우저에서는 다시 안내하지 않는다.
export function rememberTasteTestNudgeHidden() {
  if (!TASTE_TEST_NUDGE_PERSISTENCE_ENABLED) return;
  try {
    localStorage.setItem(NUDGE_HIDDEN_KEY, "1");
  } catch {
    /* 로컬 저장소 접근 불가 시 쿠키/세션 저장을 계속 시도 */
  }
  try {
    sessionStorage.setItem(NUDGE_HIDDEN_KEY, "1");
  } catch {
    /* 세션 저장소 접근 불가 시 쿠키 저장을 계속 시도 */
  }
  document.cookie = `${TASTE_TEST_NUDGE_COOKIE}=1; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax`;
}

export function dismissTasteTestNudgeForSession() {
  try {
    sessionStorage.setItem(NUDGE_HIDDEN_KEY, "1");
  } catch {
    /* 현재 마운트 동안만 닫힘 */
  }
}

export function hasHiddenTasteTestNudge() {
  if (TASTE_TEST_NUDGE_PREVIEW_ENABLED) return false;
  if (TASTE_TEST_NUDGE_PERSISTENCE_ENABLED) {
    try {
      if (localStorage.getItem(NUDGE_HIDDEN_KEY) === "1") return true;
    } catch {
      /* 다른 저장 방식 확인 */
    }
  }
  try {
    return (
      sessionStorage.getItem(NUDGE_HIDDEN_KEY) === "1" ||
      sessionStorage.getItem(TASTE_RESULT_KEY) !== null
    );
  } catch {
    return false;
  }
}

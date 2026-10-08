// 페르소나 분석 비용 가드 — 설정 읽기와 날짜 경계 계산만.
//
// store.ts 에서 떼어낸 이유는 하나다: 거기엔 `server-only` 가 걸려 있어 테스트에서 못 읽는다.
// 여기 있는 건 DB 를 안 건드리는 순수 함수라 분리해도 잃는 게 없고, 경계 계산은
// 틀려도 티가 안 나는 종류라 테스트가 꼭 필요하다.

/**
 * KST 오늘 자정을 UTC ISO 로.
 *
 * 서버가 UTC 로 돌기 때문에 그냥 "오늘" 로 끊으면 **한국 시간 오전 9시에 상한이 풀린다.**
 * 비용은 한국 날짜로 보고 있으므로 경계도 한국 자정이어야 한다.
 */
export function kstMidnightUtc(now: number = Date.now()): string {
  const KST = 9 * 3600_000;
  const midnightKst = Math.floor((now + KST) / 86_400_000) * 86_400_000;
  return new Date(midnightKst - KST).toISOString();
}

/**
 * 하루 전체 분석 상한. 비었거나 숫자가 아니거나 0 이하면 **상한 없음.**
 * 오타 하나로 서비스가 통째로 막히는 쪽이 비용이 더 나가는 쪽보다 나쁘다.
 */
export function dailyCap(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.PERSONA_DAILY_CAP);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 급할 때 새 분석을 끄는 스위치. **정확히 "1" 일 때만** 켜진다.
 * "true"·"yes" 를 넣고 꺼진 줄 아는 게 제일 위험하다 — 비용이 계속 나가는데 껐다고 믿는다.
 */
export function analysisOff(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PERSONA_ANALYSIS_OFF === "1";
}

/**
 * 입력 중 계정 미리보기를 통째로 끈다.
 *
 * 2026-10-06 실측: **두 경로가 모두 죽어 있다.** Vercel(데이터센터 IP)에서 직접 부르면 401,
 * 맥미니 프록시(주거용 IP)도 unavailable — 인스타가 양쪽을 다 막는다. 그런데도 글자를
 * 멈출 때마다 두 번 왕복하고 결국 같은 답을 받는다.
 *
 * 켜면 즉시 unavailable 을 돌려준다. 화면은 원래 그 경우를 폴백으로 다루고 있어
 * (확인 카드 없이 바로 분석) 보이는 동작은 같고 기다림만 사라진다.
 * 인스타가 다시 열리면 이 값을 지우면 된다.
 */
export function lookupOff(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PERSONA_LOOKUP_OFF === "1";
}

// 세션 리플레이 녹화 대상 판별 — 한국 방문자만 녹화해 무료 할당량(월 1만)을 절약한다.
// 스토리 유입 해외 트래픽이 리플레이 쿼터를 잠식하는 걸 막는 게 목적.
// 1차 신호: 브라우저 타임존(Asia/Seoul) = 한국 내 방문. 세션 시작 즉시 동기 판별 가능.
// 보완: 해외의 한국어 사용자(교민 등 실수요)는 언어(ko)로 포함.
// 판별 실패(구형 브라우저 등)는 안전하게 녹화(한국 유저 유실 방지).
export function isKoreaVisitor(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz === "Asia/Seoul") return true;
    return /^ko\b/i.test(navigator.language || "");
  } catch {
    return true;
  }
}

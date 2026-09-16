import "server-only";

// 크론 엔드포인트 공통 인증.
//
// CRON_SECRET 이 설정돼 있으면 Vercel 이 자동으로 실어 보내는
// `Authorization: Bearer <CRON_SECRET>` 를 검증한다(무단 호출 방지).
// 설정돼 있지 않으면 검증하지 않는다 — 로컬·프리뷰에서 손으로 때려보기 위함이다.
// **프로덕션에선 반드시 설정할 것.**
//
// 크론마다 같은 여섯 줄을 복붙하고 있었다. 한 군데서 틀리면 그 엔드포인트만
// 조용히 열려 있게 되므로 한 곳으로 모은다.
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

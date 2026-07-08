import "server-only";

// 어드민 데이터 초기화용 비밀번호 검증.
// 비밀번호는 환경변수 ADMIN_RESET_PASSWORD 로만 관리(소스 하드코딩 금지).
// 미설정 시 초기화를 거부해 빈 비밀번호 통과를 막는다.
export function verifyResetPassword(input: unknown): { error?: string } {
  const expected = process.env.ADMIN_RESET_PASSWORD;
  if (!expected) return { error: "초기화 비밀번호가 서버에 설정되지 않았어요. 운영자에게 문의하세요." };
  if (String(input ?? "") !== expected) return { error: "비밀번호가 올바르지 않아요." };
  return {};
}

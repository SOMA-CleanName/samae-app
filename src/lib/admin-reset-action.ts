"use server";

import { getCurrentUser } from "@/lib/auth";
import { verifyResetPassword } from "@/lib/admin-reset";

// 삭제 모드 진입용 비밀번호 확인 — 운영자 권한 + 비밀번호 일치.
// 잘못된 비밀번호는 진입 단계에서 차단한다(클라이언트에서 호출).
export async function checkResetPassword(
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") return { ok: false, error: "운영자 권한이 필요합니다." };
  const { error } = verifyResetPassword(password);
  if (error) return { ok: false, error };
  return { ok: true };
}

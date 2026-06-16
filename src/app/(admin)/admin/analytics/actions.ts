"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const RESET_PASSWORD = "same123!";

export type ResetState = { error?: string; ok?: boolean };

// 분석(CTA·페이지뷰) 데이터 전체 초기화 — 운영자 + 비밀번호 확인
export async function clearAnalytics(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") return { error: "운영자 권한이 필요합니다." };

  const pw = String(formData.get("password") ?? "");
  if (pw !== RESET_PASSWORD) return { error: "비밀번호가 올바르지 않아요." };

  const admin = createAdminClient();
  // 전체 삭제 (조건 없는 delete는 막히므로 항상 참인 조건)
  const { error } = await admin.from("analytics_events").delete().gte("created_at", "1970-01-01");
  if (error) return { error: error.message };

  revalidatePath("/admin/analytics");
  return { ok: true };
}

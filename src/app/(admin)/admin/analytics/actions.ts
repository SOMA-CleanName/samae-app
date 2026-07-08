"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { archiveAllAndDelete } from "@/lib/soft-delete";
import { verifyResetPassword } from "@/lib/admin-reset";
import { invalidateAnalyticsCache } from "./_data";

export type ResetState = { error?: string; ok?: boolean };

// 분석(CTA·페이지뷰) 초기화 — 소프트딜리트(아카이브 후 제거). 운영자 + 비밀번호.
export async function clearAnalytics(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") return { error: "운영자 권한이 필요합니다." };
  const pw = verifyResetPassword(formData.get("password"));
  if (pw.error) return { error: pw.error };

  const { error } = await archiveAllAndDelete("analytics_events", me.id);
  if (error) return { error };

  invalidateAnalyticsCache();
  revalidatePath("/admin/analytics");
  return { ok: true };
}

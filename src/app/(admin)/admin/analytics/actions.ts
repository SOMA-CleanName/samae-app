"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { archiveAllAndDelete } from "@/lib/soft-delete";

const RESET_PASSWORD = "same123!";

export type ResetState = { error?: string; ok?: boolean };

// 분석(CTA·페이지뷰) 초기화 — 소프트딜리트(아카이브 후 제거). 운영자 + 비밀번호.
export async function clearAnalytics(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") return { error: "운영자 권한이 필요합니다." };
  if (String(formData.get("password") ?? "") !== RESET_PASSWORD) return { error: "비밀번호가 올바르지 않아요." };

  const { error } = await archiveAllAndDelete("analytics_events", me.id);
  if (error) return { error };

  revalidatePath("/admin/analytics");
  return { ok: true };
}

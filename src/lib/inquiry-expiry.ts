import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// new(미해제) 상태로 이 기간이 지나면 만료.
// 기준은 created_at 이 아니라 new_since — 작가가 해제 신청을 취소하면 거기서 7일이 다시 시작된다.
export const INQUIRY_EXPIRE_DAYS = 7;

const DAY = 24 * 60 * 60 * 1000;

export type ExpireResult = { ok: boolean; expired: number; error?: string };

// 만료 스윕 — new 로 7일 지난 문의를 expired 로 전이.
// 매일 크론(/api/cron/expire-inquiries)에서 호출. 멱등하므로 중복 실행돼도 안전.
export async function expireStaleInquiries(): Promise<ExpireResult> {
  const admin = createAdminClient();
  const now = new Date();
  const cutoff = new Date(now.getTime() - INQUIRY_EXPIRE_DAYS * DAY).toISOString();

  const { data, error } = await admin
    .from("inquiries")
    .update({ status: "expired", expired_at: now.toISOString() })
    .eq("status", "new")
    .lt("new_since", cutoff)
    .select("id");
  if (error) return { ok: false, expired: 0, error: error.message };

  return { ok: true, expired: (data ?? []).length };
}

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminActionKey } from "./admin-audit-labels";

// 운영자 행동 기록 (0136 admin_actions).
//
// ⚠️ **기록이 실패해도 본 작업을 막지 않는다.** 환불을 처리했는데 로그 insert 가
//    실패했다고 환불이 되돌아가면, 기록을 남기려다 돈 문제를 만드는 것이다.
//    그래서 전부 삼키고 콘솔에만 남긴다.
//
// ⚠️ **본 작업이 끝난 뒤에 부른다.** 먼저 기록하면 정작 작업이 실패했을 때
//    "한 적 없는 일" 이 기록에 남는다.
//
// 삭제는 여기 남기지 않는다 — `deleted_records`(0039)가 원본째 들고 있다.

export type AuditInput = {
  action: AdminActionKey;
  actor: { id: string; label?: string | null };
  target?: { table: string; id: string };
  /** 금액·사유·before/after 처럼 나중에 "왜 그랬나" 를 답할 값 */
  detail?: Record<string, unknown>;
};

export async function logAdminAction(input: AuditInput): Promise<void> {
  try {
    await createAdminClient()
      .from("admin_actions")
      .insert({
        actor_id: input.actor.id,
        // 계정이 지워져도 누구였는지는 남아야 한다 (actor_id 는 set null 된다)
        actor_label: input.actor.label ?? null,
        action: input.action,
        target_table: input.target?.table ?? null,
        target_id: input.target?.id ?? null,
        detail: input.detail ?? {},
      });
  } catch (e) {
    console.error("[admin-audit] 기록 실패 — 본 작업은 그대로 진행됨", input.action, e);
  }
}

export type AdminActionRow = {
  id: string;
  actor_id: string | null;
  actor_label: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
};

/** 최근 기록 — 어드민 목록용 */
export async function listAdminActions(limit = 200): Promise<AdminActionRow[]> {
  const { data } = await createAdminClient()
    .from("admin_actions")
    .select("id, actor_id, actor_label, action, target_table, target_id, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as AdminActionRow[];
}

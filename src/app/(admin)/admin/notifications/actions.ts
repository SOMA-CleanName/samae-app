"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchNotify } from "@/lib/notify-dispatch";
import { isNotifyKind, type NotifyVariables } from "@/lib/notify-templates";

async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
}

/**
 * 실패한 알림 재발송 — 같은 kind·변수·dedupe 키로 다시 보낸다.
 * 원래 줄은 그대로 두고 새 줄이 생긴다 (이력 보존). dedupe 는 `sent` 만 보므로
 * failed/skipped 였던 사건은 막히지 않고, 이미 나간 사건은 조용히 skipped 로 남는다.
 * 0109 이전 줄(변수 없음)은 재발송할 수 없다 — 문안을 복원할 근거가 없다.
 */
export async function resendNotification(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id"));
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("notification_queue")
    .select("kind, profile_id, dedupe_key, variables, status")
    .eq("id", id)
    .maybeSingle();
  if (!row) throw new Error("알림을 찾을 수 없어요.");
  if (row.status === "sent") throw new Error("이미 발송된 알림이에요.");
  if (!isNotifyKind(row.kind)) throw new Error(`알 수 없는 알림 종류: ${row.kind}`);
  const variables = row.variables as NotifyVariables | null;
  if (!variables || typeof variables !== "object") throw new Error("변수가 없는 옛 기록이라 재발송할 수 없어요.");

  await dispatchNotify({
    kind: row.kind,
    profileId: row.profile_id as string | null,
    dedupeKey: row.dedupe_key as string,
    variables,
  });
  revalidatePath("/admin/notifications");
}

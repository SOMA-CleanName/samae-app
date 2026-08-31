import "server-only";

// 촬영 시각이 지난 예약을 자동으로 '촬영 완료' 로 넘긴다.
//
// 작가에게 [촬영 완료 표시] 버튼을 눌러달라고 하던 방식은 안 눌린다. 촬영이 끝난 날
// 작가는 카메라를 정리하지 앱을 열지 않고, 그 결과 결제만 끝난 채 몇 주씩 멈춘 예약이
// 남는다. 촬영이 실제로 있었는지는 **일시가 지났는가** 로 충분히 판단된다.
//
// 잘못 넘어가도 되돌릴 수 있는 전이다(보정본 전달 전 단계일 뿐이고 돈은 이미 정산됐다).
// 반대로 안 넘어가면 작가가 보정본 업로더를 못 보고, 고객은 '촬영 완료' 를 영영 못 본다.

import { createAdminClient } from "@/lib/supabase/admin";

/** 촬영 종료로 볼 여유 — 시작 시각만 알기 때문에, 그날 안에 끝났다고 보고 넘긴다 */
const GRACE_HOURS = 6;

export async function markPastShootsAsShot(): Promise<{
  ok: boolean;
  moved: number;
  error?: string;
}> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - GRACE_HOURS * 3600_000).toISOString();

  // 입금까지 끝난 건만. 미입금 예약은 촬영이 있었다고 볼 근거가 없다.
  const { data, error } = await admin
    .from("bookings")
    .update({ status: "shot", shot_at: new Date().toISOString() })
    .eq("status", "paid")
    .not("shoot_at", "is", null)
    .lt("shoot_at", cutoff)
    .select("id, user_id");
  if (error) return { ok: false, moved: 0, error: error.message };

  const rows = (data ?? []) as { id: string; user_id: string }[];
  for (const b of rows) {
    await admin.from("notifications").insert({
      recipient_id: b.user_id,
      type: "booking",
      title: "촬영이 완료됐어요",
      body: "보정본 전달을 기다려주세요.",
      link: `/bookings/${b.id}`,
    });
  }

  return { ok: true, moved: rows.length };
}

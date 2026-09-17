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

// ── 결과물 전달 기한 초과 알림 ───────────────────────────────────
// 기한이 지났는데 아직 전달이 없으면 양쪽에 한 번 알린다. 14일 이상 넘기면 고객은
// 전액 환불을 요구할 수 있다(취소환불 10조 2항) — 그 사실도 고객 알림에 적는다.
// 어드민 강조는 거래 화면이 delivery_due_at 을 보고 직접 그린다.
export async function notifyDeliveryOverdue(now: Date = new Date()): Promise<{
  ok: boolean;
  notified: number;
  error?: string;
}> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("bookings")
    .select("id, user_id, photographer_id, delivery_due_at")
    .in("status", ["paid", "shot"])
    .is("delivered_at", null)
    .is("notice_delivery_overdue_at", null)
    .not("delivery_due_at", "is", null)
    .lt("delivery_due_at", now.toISOString());
  if (error) return { ok: false, notified: 0, error: error.message };

  const rows = (data ?? []) as { id: string; user_id: string; photographer_id: string; delivery_due_at: string }[];
  const stamp = now.toISOString();
  for (const b of rows) {
    const { data: ph } = await admin
      .from("photographers")
      .select("profile_id")
      .eq("id", b.photographer_id)
      .maybeSingle();
    await admin.from("notifications").insert([
      {
        recipient_id: b.user_id,
        type: "booking",
        title: "결과물 전달 기한이 지났어요",
        body: "작가님께 전달을 요청해 주세요. 기한을 14일 이상 넘기면 사매에 전액 환불을 요청할 수 있어요.",
        link: `/bookings/${b.id}`,
      },
      ...(ph
        ? [
            {
              recipient_id: ph.profile_id,
              type: "booking",
              title: "결과물 전달 기한이 지났어요",
              body: "결과물을 전달하고 채팅의 [전달 완료]를 눌러주세요. 14일 이상 늦으면 고객이 전액 환불을 요구할 수 있어요.",
              link: `/bookings/${b.id}`,
            },
          ]
        : []),
    ]);
    await admin.from("bookings").update({ notice_delivery_overdue_at: stamp }).eq("id", b.id);
  }
  return { ok: true, notified: rows.length };
}

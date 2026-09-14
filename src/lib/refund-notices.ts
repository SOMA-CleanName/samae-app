import "server-only";

// 위약금 구간 전환 예고 알림.
//
// 구간이 바뀌는 날은 둘이다 (취소환불정책 4조·5조, 달력일 기준):
//   · 촬영 8일 전 → 내일(7일 전)부터 위약금 40%
//   · 촬영 4일 전 → 내일(3일 전)부터 위약금 90%
// 각각 그 날에 한 번 알린다. 청약철회 마감은 알리지 않는다 — 8일 이상 구간은 어차피 전액 환불이라
// 돈이 갈리지 않는다.
//
// 무섭게 느껴질 수 있지만 반대다. 분쟁에서 "고지받지 못했다" 는 주장을 봉쇄하고, 취소할 고객을
// 하루라도 일찍 나오게 해서 작가가 슬롯을 회복할 시간을 번다.
//
// 하루 한 번 도는 크론이 호출한다. 같은 날 두 번 돌아도 중복 발송하지 않게 보낸 표시를 예약 행에 남긴다.
// 일정이 바뀌면(reschedule) 두 표시를 비워 새 날짜 기준으로 다시 알린다.

import { createAdminClient } from "@/lib/supabase/admin";
import { daysUntilShoot } from "@/lib/refund";

/** 진행 중인 예약만 대상 — 취소·환불된 건에 알림이 가면 그 자체가 사고다 */
const LIVE = ["paid", "shot"];

type Row = {
  id: string;
  user_id: string;
  status: string;
  shoot_at: string | null;
  shoot_date: string | null;
  transfer_marked_at: string | null;
  notice_penalty_at: string | null;
  notice_penalty_90_at: string | null;
};

async function notify(
  admin: ReturnType<typeof createAdminClient>,
  recipientId: string,
  title: string,
  body: string,
  bookingId: string
) {
  await admin.from("notifications").insert({
    recipient_id: recipientId,
    type: "booking",
    title,
    body,
    link: `/bookings/${bookingId}`,
  });
}

export async function sendRefundWindowNotices(now: Date = new Date()): Promise<{
  ok: boolean;
  penalty40: number;
  penalty90: number;
  error?: string;
}> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, user_id, status, shoot_at, shoot_date, transfer_marked_at, notice_penalty_at, notice_penalty_90_at"
    )
    .in("status", LIVE)
    .not("transfer_marked_at", "is", null);
  if (error) return { ok: false, penalty40: 0, penalty90: 0, error: error.message };

  const rows = (data ?? []) as Row[];
  let penalty40 = 0;
  let penalty90 = 0;
  const stamp = now.toISOString();

  for (const b of rows) {
    const days = daysUntilShoot(b.shoot_at, b.shoot_date, now);
    if (days == null) continue;

    // ① 8일 전 — 오늘까지가 전액 환불의 마지막 날
    if (days === 8 && !b.notice_penalty_at) {
      await notify(
        admin,
        b.user_id,
        "내일부터는 위약금 40%가 빠져요",
        "오늘까지 취소하시면 전액 환불됩니다. 내일부터는 지불 금액의 60%가 환불돼요.",
        b.id
      );
      await admin.from("bookings").update({ notice_penalty_at: stamp }).eq("id", b.id);
      penalty40++;
    }

    // ② 4일 전 — 내일부터는 10%만 돌아온다
    if (days === 4 && !b.notice_penalty_90_at) {
      await notify(
        admin,
        b.user_id,
        "내일부터는 위약금 90%가 빠져요",
        "촬영 3일 전부터는 지불 금액의 10%만 환불돼요. 일정 확인 부탁드려요.",
        b.id
      );
      await admin.from("bookings").update({ notice_penalty_90_at: stamp }).eq("id", b.id);
      penalty90++;
    }
  }

  return { ok: true, penalty40, penalty90 };
}

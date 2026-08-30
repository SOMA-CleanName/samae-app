import "server-only";

// 구간 전환 예고 알림 (docs/32 §6-4).
//
// 연락처 개방은 여기서 다루지 않는다 — 시간이 아니라 작가가 보내는 순간 일어난다(§3-3).
//
// 환불 조건이 바뀌는 지점이 정확히 두 개다. 각각 하루 전에 알린다.
// 무섭게 느껴질 수 있지만 반대다 — 다크패턴의 정확한 반대이고, 분쟁에서
// "고지받지 못했다" 는 주장을 봉쇄한다. 그리고 취소할 고객을 하루라도 일찍 나오게 해서
// 작가가 슬롯을 회복할 시간을 번다.
//
// 하루 한 번 도는 크론이 호출한다. 같은 날 두 번 돌아도 중복 발송하지 않게
// 보낸 표시를 예약 행에 남긴다.

import { createAdminClient } from "@/lib/supabase/admin";
import { REFUND_WINDOW_DAYS, WITHDRAWAL_DAYS } from "@/lib/refund";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 진행 중인 예약만 대상 — 취소·환불된 건에 알림이 가면 그 자체가 사고다 */
const LIVE = ["accepted", "paid", "shot"];

type Row = {
  id: string;
  user_id: string;
  status: string;
  shoot_at: string | null;
  shoot_date: string | null;
  transfer_marked_at: string | null;
  notice_withdrawal_at: string | null;
  notice_penalty_at: string | null;
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

export async function sendRefundWindowNotices(): Promise<{
  ok: boolean;
  withdrawal: number;
  penalty: number;
  error?: string;
}> {
  const admin = createAdminClient();
  const now = Date.now();

  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, user_id, status, shoot_at, shoot_date, transfer_marked_at, notice_withdrawal_at, notice_penalty_at"
    )
    .in("status", LIVE)
    .not("transfer_marked_at", "is", null);
  if (error) return { ok: false, withdrawal: 0, penalty: 0, error: error.message };

  const rows = (data ?? []) as Row[];
  let withdrawal = 0;
  let penalty = 0;

  for (const b of rows) {
    const paidAt = b.transfer_marked_at ? new Date(b.transfer_marked_at).getTime() : NaN;
    if (isNaN(paidAt)) continue;
    const stamp = new Date().toISOString();

    // ① 청약철회 종료 하루 전 — 오늘까지가 전액 환불의 마지막 날
    const withdrawEnd = paidAt + WITHDRAWAL_DAYS * DAY_MS;
    if (!b.notice_withdrawal_at && now >= withdrawEnd - DAY_MS && now < withdrawEnd) {
      await notify(
        admin,
        b.user_id,
        "내일부터 취소 시 위약금이 붙어요",
        "오늘까지 취소하시면 전액 환불됩니다. 내일부터는 결제 금액의 50%가 위약금으로 부과돼요.",
        b.id
      );
      await admin.from("bookings").update({ notice_withdrawal_at: stamp }).eq("id", b.id);
      withdrawal++;
    }

    // ② 환불 마감 하루 전 — 내일부터는 환불이 사라진다
    const shootMs = b.shoot_at
      ? new Date(b.shoot_at).getTime()
      : b.shoot_date
      ? new Date(`${b.shoot_date}T23:59:59+09:00`).getTime()
      : NaN;
    if (!isNaN(shootMs)) {
      const penaltyAt = shootMs - REFUND_WINDOW_DAYS * DAY_MS;
      if (!b.notice_penalty_at && now >= penaltyAt - DAY_MS && now < penaltyAt) {
        await notify(
          admin,
          b.user_id,
          "내일부터는 취소해도 환불되지 않아요",
          "촬영 7일 전부터는 환불이 어려워요. 일정 확인 부탁드려요.",
          b.id
        );
        await admin.from("bookings").update({ notice_penalty_at: stamp }).eq("id", b.id);
        penalty++;
      }
    }
  }

  return { ok: true, withdrawal, penalty };
}

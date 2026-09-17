// 연락처를 **언제부터** 보낼 수 있는가 (HANDOFF §3-1, 2026-09-14 결정).
//
// ── 왜 시점을 늦추나 ────────────────────────────────────────────
// 입금 확인 직후부터 연락처가 나가는데, 신 정책은 촬영 8일 이상 전 취소의 위약금이 **0%** 다.
// 둘이 겹치면 이탈 경로가 열린다:
//
//   ① 촬영 30일 전 결제 → ② 작가가 연락처 전달 → ③ "취소하고 직접 하시죠"
//   → ④ 8일 이상 전이라 위약금 0%, 전액 환불 → ⑤ 직거래
//   고객 이득 · 작가 이득 · 사매는 PG 수수료만 날린다(환불해도 반환되지 않는다)
//
// 구 정책은 *연락처를 받으면 100% 구간이 닫힌다* 로 이걸 막았는데, 신 정책에서 그 조항이
// 빠지면서 방어가 사라졌다. 그래서 **전달 가능 시점을 위약금이 붙는 시점과 맞춘다.**
//
// 7일 전부터면 취소 시 위약금 40% 라 고객이 실제로 돈을 날려야 하고, 작가가 그 이상
// 깎아주면 작가도 남는 게 없어 **유인이 스스로 사라진다.** 연락처의 실제 용도(촬영 당일
// 위치·시간 조율)에도 7일이면 충분하다.
//
// ⚠️ 이건 `docs/32 §3-3` 이 폐기한 "7일 자동 개방" 과 **반대 방향이다.** 그쪽은 시간이
//    지나면 고지·동의 없이 저절로 열리는 방식이라 기록이 안 남아서 버렸다. 여기서는
//    두 단계(작가가 보내고 → 고객이 고지 읽고 받는다)를 그대로 두고 **시작점만 미룬다.**

import { daysUntilShoot } from "./refund";

/** 연락처를 건넬 수 있는 예약 단계 — 입금이 확인된 뒤에만 */
export const CONTACT_DELIVERABLE_STATUS = ["paid", "shot", "delivered", "completed"];

/** 촬영일까지 이 날수 이하로 남아야 열린다 */
export const CONTACT_OPEN_DAYS = 7;

export type ContactGate =
  | { allowed: true }
  | { allowed: false; reason: "not_paid" | "too_early" | "no_shoot_date"; notice: string };

/**
 * 지금 이 예약의 연락처를 보낼 수 있는가.
 *
 * 촬영일이 **지난** 건도 연다 — 당일 조율이 필요한 시점이고, 남은 날수가 음수면
 * 자연히 7일 이하다.
 */
export function contactSendGate(params: {
  status: string;
  shootAt: string | null;
  shootDate?: string | null;
  now?: Date;
}): ContactGate {
  if (!CONTACT_DELIVERABLE_STATUS.includes(params.status)) {
    return { allowed: false, reason: "not_paid", notice: "입금이 확인된 뒤에 보낼 수 있어요." };
  }

  const days = daysUntilShoot(params.shootAt, params.shootDate, params.now ?? new Date());

  // 촬영일이 없으면 위약금 구간을 셀 수 없어 **취소가 늘 전액 환불**이다 — 이탈 유인이
  // 가장 큰 자리라 여기서 열면 안 된다. 일정이 잡히면 그때 열린다.
  if (days == null) {
    return {
      allowed: false,
      reason: "no_shoot_date",
      notice: "촬영일이 정해지면 연락처를 보낼 수 있어요.",
    };
  }

  if (days > CONTACT_OPEN_DAYS) {
    return {
      allowed: false,
      reason: "too_early",
      notice: `촬영 ${CONTACT_OPEN_DAYS}일 전부터 전달할 수 있어요. (${days}일 남음)`,
    };
  }

  return { allowed: true };
}

/** 언제부터 열리는가 — 화면이 날짜로 알려줄 때 쓴다 */
export function contactOpensAt(
  shootAt: string | null,
  shootDate?: string | null
): Date | null {
  const base = shootAt ? new Date(shootAt) : shootDate ? new Date(`${shootDate}T23:59:59+09:00`) : null;
  if (!base || isNaN(base.getTime())) return null;
  // 남은 날수가 7이 되는 날의 KST 자정
  const DAY = 24 * 60 * 60 * 1000;
  const KST = 9 * 60 * 60 * 1000;
  const shootDay = Math.floor((base.getTime() + KST) / DAY);
  return new Date((shootDay - CONTACT_OPEN_DAYS) * DAY - KST);
}

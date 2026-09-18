// 에스크로 운영 큐 — **운영자가 손을 대야 하는 예약**이 무엇인가.
//
// 거래 흐름은 이렇다.
//
//   채팅 → 예약 제안 → 고객 수락 → 고객에게 사매 계좌 안내 → 고객 입금
//   → 고객이 [입금 완료] 알림 → ① **운영이 대조·확인**(accepted → paid) → 예약 확정
//   → 촬영 → 작가가 결과물 전달 알림 → ② **운영이 수수료 떼고 정산**
//
// ①과 ②가 사람이 멈춰 서면 멈추는 두 지점이다. 그래서 어디서든 같은 수를 보여줘야 하는데,
// 전에는 이 조건이 `/admin/transactions` 안에 인라인으로만 있었다. 대시보드가 같은 걸
// 다시 적으면 조건이 갈라지고, **갈라진 걸 아무도 모른다** — 양쪽 다 그럴듯한 수를 보여주니까.
//
// 그래서 여기 한 벌만 둔다. server-only 를 들이지 않는다 — 테스트가 못 돈다.

import { settlementSla } from "./settlement-sla";

/** 돈이 오간 거래 */
export const PAID_BOOKING = ["paid", "shot", "delivered", "completed"] as const;

/** 종료·취소·환불을 뺀 진행 중 */
export const IN_PROGRESS = ["requested", "accepted", "paid", "shot", "delivered"] as const;

/** 큐 판정에 필요한 최소 모양. 실제 행에는 훨씬 많은 칸이 있다. */
export type QueueBooking = {
  status: string;
  /** 고객이 [입금 완료] 를 누른 시각 — 누르기 전에는 null */
  transfer_marked_at?: string | null;
  /** 작가가 결과물 전달을 알린 시각 */
  delivered_at?: string | null;
  settled_at?: string | null;
  refunded_at?: string | null;
};

/**
 * ① 입금 확인 대기 — 고객이 입금했다고 알렸고 아직 운영이 대조하지 않은 건.
 *
 * 수락만 해놓고 아무 소식이 없는 건(`awaitingDeposit`)과 **갈라야 한다.** 섞으면
 * "지금 내가 확인해야 할 것" 이 "고객을 기다리는 것" 에 파묻힌다.
 */
export function awaitingConfirm<T extends QueueBooking>(rows: T[]): T[] {
  return rows.filter((b) => b.status === "accepted" && !!b.transfer_marked_at);
}

/** ③ 입금 대기 — 수락됐지만 고객이 아직 입금 알림을 안 보낸 건. 운영이 할 일은 없다. */
export function awaitingDeposit<T extends QueueBooking>(rows: T[]): T[] {
  return rows.filter((b) => b.status === "accepted" && !b.transfer_marked_at);
}

/**
 * ② 정산 대기 — 결과물 전달이 끝났고 아직 안 보낸 건. **급한 순으로 정렬한다.**
 *
 * 정산은 전달 뒤에만 한다(작가약관 13조 1항). 촬영 전 건은 여기 오지 않는다.
 * 환불된 건도 뺀다 — 정산할 돈이 없다.
 *
 * 목록 순서가 곧 처리 순서다. 기한(`settlement-sla`, 전달 알림으로부터 7영업일)이
 * 임박한 건이 위로 온다. 기한을 못 세는 건은 뒤로 보낸다.
 */
export function awaitingSettle<T extends QueueBooking>(rows: T[], now: Date = new Date()): T[] {
  return rows
    .filter(
      (b) =>
        (PAID_BOOKING as readonly string[]).includes(b.status) &&
        !!b.delivered_at &&
        !b.settled_at &&
        !b.refunded_at
    )
    .sort(
      (x, y) =>
        (settlementSla(x.delivered_at, x.settled_at, now)?.daysLeft ?? 99) -
        (settlementSla(y.delivered_at, y.settled_at, now)?.daysLeft ?? 99)
    );
}

/** 정산 대기 중 기한을 넘긴 건 — 우리가 늦은 것이라 먼저 보여야 한다 */
export function overdueSettle<T extends QueueBooking>(rows: T[], now: Date = new Date()): T[] {
  return awaitingSettle(rows, now).filter(
    (b) => settlementSla(b.delivered_at, b.settled_at, now)?.overdue === true
  );
}

/** 대시보드가 쓰는 한 줄 요약 */
export type QueueCounts = {
  /** 지금 운영이 대조해야 하는 입금 */
  confirm: number;
  /** 지금 운영이 보내야 하는 정산 */
  settle: number;
  /** 그중 기한을 넘긴 것 */
  settleOverdue: number;
  /** 고객 입금을 기다리는 중 — 운영이 할 일은 없다 */
  deposit: number;
};

export function queueCounts<T extends QueueBooking>(rows: T[], now: Date = new Date()): QueueCounts {
  const settle = awaitingSettle(rows, now);
  return {
    confirm: awaitingConfirm(rows).length,
    settle: settle.length,
    settleOverdue: overdueSettle(rows, now).length,
    deposit: awaitingDeposit(rows).length,
  };
}

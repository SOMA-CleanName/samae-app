"use client";

// 거래 목록 — 한 줄 요약에서 펼치면 그 예약의 전부가 나온다.
//
// 운영이 입금을 확정하기 전에 봐야 하는 것: 금액이 협의대로인가, 어떤 대화에서 나왔나,
// 어디까지 진행됐나. 그걸 보려고 매번 다른 화면을 뒤지게 하면 확인 없이 버튼만 누르게 된다.
// 그래서 상세와 조치를 같은 자리에 둔다.

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { SelectCheckbox } from "@/components/admin/DeleteMode";
import { refundBasisLabel, type RefundQuote } from "@/lib/refund";
import { OVERDUE_REFUND_DAYS, overdueDays } from "@/lib/delivery-deadline";
import type { BookingFieldValue } from "@/lib/booking-fields";
import { adminConfirmTransfer, adminMarkSettled, adminMarkDepositAndConfirm } from "./actions";
import { BookingMoney } from "@/components/booking/BookingMoney";
import { AdminRefundButton } from "./AdminRefundButton";
import { AdminCancelButton } from "./AdminCancelButton";

const fmt = new Intl.NumberFormat("ko-KR");

const BOOKING_STATUS: Record<
  string,
  { label: string; tone: "warning" | "info" | "success" | "neutral" | "danger" }
> = {
  requested: { label: "요청", tone: "warning" },
  accepted: { label: "수락", tone: "info" },
  paid: { label: "결제", tone: "success" },
  shot: { label: "촬영", tone: "success" },
  delivered: { label: "전달", tone: "success" },
  completed: { label: "완료", tone: "success" },
  rejected: { label: "반려", tone: "neutral" },
  cancelled: { label: "취소", tone: "neutral" },
  refunded: { label: "환불", tone: "danger" },
};

export type BookingRow = {
  id: string;
  status: string;
  amount_krw: number | null;
  travel_fee_krw: number;
  shoot_at: string | null;
  location_text: string | null;
  memo: string | null;
  customFields: BookingFieldValue[];
  packageName: string | null;
  userName: string | null;
  photographerName: string | null;
  proposedByPhotographer: boolean;
  requested_at: string | null;
  accepted_at: string | null;
  transfer_marked_at: string | null;
  paid_at: string | null;
  settled_at: string | null;
  delivered_at: string | null;
  delivery_due_at: string | null;
  settlement_amount_krw: number | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  conversationId: string | null;
  refunded_at: string | null;
  refund_reason: string | null;
  /** 환불 요청 접수 시각 — 3영업일 SLA 기산점 */
  refundDueAt: string | null;
  /** 그 기한을 넘겼는가 */
  refundOverdue: boolean;
  /** 이 예약에 부과된(또는 부과될) 사매 수수료 — 스냅샷 우선 */
  feeKrw: number;
  /** "정률 10%" 처럼 사람이 읽는 근거 */
  feeLabel: string;
  /** 위약금을 작가·사매가 나누는 비율 — 예외 판정 미리보기가 이걸 써야 실행값과 같아진다 */
  feeRate: number;
  /** 수수료의 부가세 */
  vatKrw: number;
  /** 원천징수 (사업자 미등록 작가) */
  withholdingKrw: number;
  /** 작가에게 실제로 보낼 금액 — 운영자가 은행 앱에 옮겨 적는 숫자다. 서버에서 계산해 내려온다 */
  payoutKrw: number;
  /** 지금 환불하면 어떻게 되는지 (docs/32) */
  refund: RefundQuote;
};

const day = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("ko-KR", {
        month: "numeric",
        day: "numeric",
        timeZone: "Asia/Seoul",
      }).format(new Date(iso))
    : "—";

const stamp = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("ko-KR", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Seoul",
      }).format(new Date(iso))
    : null;

export function AdminBookings({ bookings }: { bookings: BookingRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {bookings.map((b) => {
        const s = BOOKING_STATUS[b.status] ?? { label: b.status, tone: "neutral" as const };
        const open = openId === b.id;
        return (
          <li key={b.id}>
            <div className="flex items-center gap-3 px-4 py-3">
              <SelectCheckbox id={b.id} />
              <button
                type="button"
                onClick={() => setOpenId(open ? null : b.id)}
                aria-expanded={open}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-semibold text-fg">
                    {b.packageName || "촬영"}
                  </span>
                  <span className="block truncate text-caption text-faint">
                    {b.userName ?? "고객"} → {b.photographerName ?? "작가"} · 촬영 {day(b.shoot_at)}
                  </span>
                </span>
                <span className="shrink-0 text-body-sm font-semibold tabular-nums text-fg">
                  ₩{fmt.format(b.amount_krw ?? 0)}
                </span>
              </button>
              {b.refundOverdue && (
                <Badge tone="danger">환불 지연</Badge>
              )}
              <Badge tone={s.tone}>{s.label}</Badge>
            </div>

            {open && <BookingDetail b={b} />}
          </li>
        );
      })}
      {bookings.length === 0 && (
        <li className="px-4 py-6 text-center text-caption text-faint">거래가 없어요.</li>
      )}
    </ul>
  );
}

function BookingDetail({ b }: { b: BookingRow }) {

  // 진행 흐름 — 비어 있는 칸이 곧 '여기서 멈춰 있다'
  const steps: { label: string; at: string | null }[] = [
    { label: b.proposedByPhotographer ? "작가 제안" : "고객 제안", at: b.requested_at },
    { label: "수락", at: b.accepted_at },
    { label: "고객 입금 알림", at: b.transfer_marked_at },
    { label: "사매 입금 확인", at: b.paid_at },
    { label: "작가 정산", at: b.settled_at },
  ];

  return (
    <div className="border-t border-line bg-bg px-4 py-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* 예약 내용 */}
        <section>
          <p className="text-caption font-semibold text-muted">예약 내용</p>
          <dl className="mt-1.5 flex flex-col gap-1 text-caption">
            <Row k="일시" v={stamp(b.shoot_at) ?? "미정"} />
            <Row k="장소" v={b.location_text || "—"} />
            {b.customFields.map((f) => (
              <Row key={f.id} k={f.label} v={f.value} />
            ))}
            {b.memo && <Row k="메모" v={b.memo} />}
          </dl>
        </section>

        <BookingMoney b={b} />
      </div>

      {/* 진행 */}
      <section className="mt-4">
        <p className="text-caption font-semibold text-muted">진행</p>
        <ol className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          {steps.map((st) => (
            <li key={st.label} className="text-caption">
              <span className={st.at ? "text-fg" : "text-faint"}>
                {st.at ? "✓" : "○"} {st.label}
              </span>
              {st.at && <span className="ml-1 text-faint">{stamp(st.at)}</span>}
            </li>
          ))}
        </ol>
        {b.cancelled_at && (
          <p className="mt-1.5 text-caption text-danger-ink">
            {b.refunded_at ? "환불됨" : "취소됨"} {stamp(b.cancelled_at)}
            {b.refund_reason ? ` · ${refundBasisLabel(b.refund_reason)}` : ""}
            {b.cancel_reason ? ` — ${b.cancel_reason}` : ""}
          </p>
        )}
      </section>

      {/* 결과물 전달 기한 초과 — 14일 이상이면 고객이 전액 환불을 요구할 수 있다 (취소환불 10조 2항) */}
      {!b.delivered_at && !b.refunded_at && ["paid", "shot"].includes(b.status) && b.delivery_due_at && (() => {
        const late = overdueDays(b.delivery_due_at);
        if (late == null || late <= 0) return null;
        return (
          <p className={`mt-3 rounded-lg px-3 py-2 text-caption ${late >= OVERDUE_REFUND_DAYS ? "bg-danger/10 font-semibold text-danger" : "bg-warning-soft text-warning"}`}>
            결과물 전달 기한 {late}일 초과 · {late >= OVERDUE_REFUND_DAYS ? "고객 전액 환불 요구 가능 — 작가 귀책 처리" : "작가에게 전달을 재촉하세요"}
          </p>
        );
      })()}

      {/* 환불 요청이 접수돼 있으면 기한을 먼저 보여준다 — 초과하면 연 15% 지연이자가
          법정 의무로 붙는다(제18조 제2항). 주말이 끼면 달력 3일로는 그냥 넘어간다. */}
      {b.refundDueAt && !b.refunded_at && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-caption ${
            b.refundOverdue
              ? "bg-danger/10 font-semibold text-danger-ink"
              : "bg-warning-soft text-warning-ink"
          }`}
        >
          환불 요청 접수 {stamp(b.refundDueAt)} ·{" "}
          {b.refundOverdue ? "3영업일 기한을 넘겼어요 — 지연이자 대상" : "3영업일 이내 환급"}
        </p>
      )}

      {/* 환불 — 버튼을 누르기 전에 '얼마가 어디로 가는지' 를 먼저 보여준다.
          계산은 lib/refund.ts 한 곳에서만 한다 (docs/32). */}
      {!b.refunded_at && b.transfer_marked_at && (
        <section className="mt-4 rounded-xl bg-bg-2 p-3">
          <p className="text-caption font-semibold text-muted">지금 환불하면</p>
          <p className="mt-1 text-caption text-fg">
            <b>{b.refund.percent}% · ₩{fmt.format(b.refund.refundKrw)}</b> 고객 환불 ·{" "}
            {b.refund.penaltyKrw > 0
              ? `위약금 ₩${fmt.format(b.refund.penaltyKrw)} (작가 ₩${fmt.format(b.refund.penaltyPhotographerKrw)} · 사매 ₩${fmt.format(b.refund.penaltyCompanyKrw)})`
              : b.refund.feeClaimKrw > 0
                ? `작가에게 수수료 상당액 ₩${fmt.format(b.refund.feeClaimKrw)} 청구`
                : b.refund.feeWaived
                  ? "수수료 없음"
                  : `수수료 ₩${fmt.format(b.refund.feeKrw)} 유지`}
            {b.refund.daysUntilShoot != null && ` · 촬영까지 ${b.refund.daysUntilShoot}일`}
          </p>
          <p className="mt-0.5 text-caption text-faint">{b.refund.reason}</p>
        </section>
      )}

      {/* 조치 */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {b.conversationId && (
          <Link
            href={`/admin/chats/${b.conversationId}`}
            className="rounded-lg border border-line-strong px-3 py-1.5 text-caption font-medium text-fg transition-colors hover:bg-fg/[0.05]"
          >
            대화 보기
          </Link>
        )}
        {/* 고객이 [입금 완료] 를 안 누른 건 — 통장에 돈이 들어왔으면 운영이 대신 표시한다.
            버튼은 '고객이 알렸다' 는 신호일 뿐이고 확인 주체는 어차피 사매다. */}
        {b.status === "accepted" && !b.transfer_marked_at && (
          <form action={adminMarkDepositAndConfirm}>
            <input type="hidden" name="id" value={b.id} />
            <button className="cursor-pointer rounded-lg bg-fg px-3 py-1.5 text-caption font-semibold text-bg hover:opacity-90">
              입금 확인 (고객 미표시)
            </button>
          </form>
        )}

        {/* 입금 확인 — 고객이 입금을 알린 건만. 정산은 결과물 전달 뒤에 따로 */}
        {b.status === "accepted" && b.transfer_marked_at && (
          <form action={adminConfirmTransfer}>
            <input type="hidden" name="id" value={b.id} />
            <button className="cursor-pointer rounded-lg bg-fg px-3 py-1.5 text-caption font-semibold text-bg hover:opacity-90">
              입금 확인
            </button>
          </form>
        )}

        {/* 정산 완료 — 결과물이 전달된 건만 (수수료정책 3조 1항). 실제 송금은 사람이 하고 여기서 기록한다 */}
        {["paid", "shot", "delivered", "completed"].includes(b.status) && !!b.delivered_at && !b.settled_at && (
          <form action={adminMarkSettled}>
            <input type="hidden" name="id" value={b.id} />
            <button className="cursor-pointer rounded-lg border border-line-strong px-3 py-1.5 text-caption font-semibold text-fg hover:bg-fg/[0.04]">
              정산 완료 마킹
            </button>
          </form>
        )}

        {!b.refunded_at && b.transfer_marked_at && (
          <AdminRefundButton
            bookingId={b.id}
            quote={b.refund}
            amountKrw={b.amount_krw ?? 0}
            feeRate={b.feeRate}
            label={`${b.userName ?? "고객"} → ${b.photographerName ?? "작가"} · ₩${fmt.format(b.amount_krw ?? 0)}`}
          />
        )}

        {["requested", "accepted"].includes(b.status) && (
          <span className="ml-auto">
            <AdminCancelButton
              bookingId={b.id}
              label={`${b.userName ?? "고객"} → ${b.photographerName ?? "작가"} · ₩${fmt.format(b.amount_krw ?? 0)}`}
            />
          </span>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-faint">{k}</dt>
      <dd className={`min-w-0 flex-1 ${strong ? "font-semibold text-fg" : "text-fg"}`}>{v}</dd>
    </div>
  );
}

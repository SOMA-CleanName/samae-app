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
import { PLATFORM_FEE_KRW } from "@/lib/platform-fee";
import type { BookingFieldValue } from "@/lib/booking-fields";
import { adminSettleNow, adminMarkSettled } from "./actions";
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
  settlement_amount_krw: number | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  conversationId: string | null;
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
  const shootFee = (b.amount_krw ?? 0) - (b.travel_fee_krw ?? 0);
  const payout = Math.max(0, (b.amount_krw ?? 0) - PLATFORM_FEE_KRW);

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

        {/* 금액 */}
        <section>
          <p className="text-caption font-semibold text-muted">금액</p>
          <dl className="mt-1.5 flex flex-col gap-1 text-caption">
            <Row k="촬영비" v={`₩${fmt.format(shootFee)}`} />
            {b.travel_fee_krw > 0 && <Row k="출장비" v={`₩${fmt.format(b.travel_fee_krw)}`} />}
            <Row k="고객 입금액" v={`₩${fmt.format(b.amount_krw ?? 0)}`} strong />
            <Row k="수수료" v={`− ₩${fmt.format(PLATFORM_FEE_KRW)}`} />
            <Row
              k="작가 송금액"
              v={`₩${fmt.format(b.settlement_amount_krw ?? payout)}`}
              strong
            />
          </dl>
        </section>
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
          <p className="mt-1.5 text-caption text-danger">
            취소됨 {stamp(b.cancelled_at)}
            {b.cancel_reason ? ` — ${b.cancel_reason}` : ""}
          </p>
        )}
      </section>

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
        {/* 입금 확인 + 정산 — 고객이 입금을 알린 건만 */}
        {b.status === "accepted" && b.transfer_marked_at && (
          <form action={adminSettleNow}>
            <input type="hidden" name="id" value={b.id} />
            <button className="cursor-pointer rounded-lg bg-fg px-3 py-1.5 text-caption font-semibold text-bg hover:opacity-90">
              확인 · 정산
            </button>
          </form>
        )}

        {/* 정산 누락 보정 — 확인은 됐는데 기록이 없는 건 */}
        {["paid", "shot", "delivered", "completed"].includes(b.status) && !b.settled_at && (
          <form action={adminMarkSettled}>
            <input type="hidden" name="id" value={b.id} />
            <button className="cursor-pointer rounded-lg border border-warning/40 bg-warning-soft px-3 py-1.5 text-caption font-semibold text-warning hover:opacity-90">
              정산 완료 마킹
            </button>
          </form>
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

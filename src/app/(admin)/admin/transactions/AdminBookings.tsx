"use client";

import { Badge } from "@/components/ui";
import { SelectCheckbox } from "@/components/admin/DeleteMode";

const fmt = new Intl.NumberFormat("ko-KR");

const BOOKING_STATUS: Record<string, { label: string; tone: "warning" | "info" | "success" | "neutral" | "danger" }> = {
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
  shoot_at: string | null;
  packageName: string | null;
  userName: string | null;
  photographerName: string | null;
};

const day = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(iso))
    : "—";

// 거래(booking) 목록 — 삭제 모드 시 각 행에 선택 체크박스 노출.
export function AdminBookings({ bookings }: { bookings: BookingRow[] }) {
  return (
    <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {bookings.map((b) => {
        const s = BOOKING_STATUS[b.status] ?? { label: b.status, tone: "neutral" as const };
        return (
          <li key={b.id} className="flex items-center gap-3 px-4 py-3">
            <SelectCheckbox id={b.id} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm font-semibold text-fg">{b.packageName || "촬영"}</p>
              <p className="truncate text-caption text-faint">
                {b.userName ?? "고객"} → {b.photographerName ?? "작가"} · 촬영 {day(b.shoot_at)}
              </p>
            </div>
            <span className="shrink-0 text-body-sm font-semibold tabular-nums text-fg">
              ₩{fmt.format(b.amount_krw ?? 0)}
            </span>
            <Badge tone={s.tone}>{s.label}</Badge>
          </li>
        );
      })}
    </ul>
  );
}

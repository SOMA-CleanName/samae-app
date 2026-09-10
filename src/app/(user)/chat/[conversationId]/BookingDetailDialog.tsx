"use client";

// 예약 내용 다이얼로그 — 채팅방 어디서든 "내가 뭘 예약했더라" 를 즉시 펼친다.
//
// 예약 카드는 타임라인 위의 한 메시지라, 대화가 몇 줄만 쌓여도 위로 밀려 사라진다.
// 정작 일시·장소·금액은 촬영 전날까지 계속 다시 보게 되는 정보다. 그래서 상단에 상주하는
// 버튼을 두고, 눌렀을 때 방을 떠나지 않고 그 자리에서 보여준다.
// (다른 화면으로 보내면 대화 맥락이 끊기고 돌아오는 길이 한 번 더 생긴다)

import { bookingStatusLabel, type BookingStatus } from "@/lib/booking-status";
import { readStoredFieldValues } from "@/lib/booking-fields";
import { CalendarIcon, MapPinIcon, XIcon } from "@/components/user/icons";

const fmt = new Intl.NumberFormat("ko-KR");

export type BookingDetail = {
  id: string;
  status: string;
  shoot_at: string | null;
  shoot_date: string | null;
  location_text: string | null;
  memo: string | null;
  amount_krw: number | null;
  travel_fee_krw: number;
  custom_fields: unknown;
  transfer_marked_at: string | null;
  package_snapshot: { name?: string } | null;
};

/** 카드와 같은 규칙으로 일시를 쓴다 — 두 곳이 다르게 보이면 어느 쪽이 맞는지 흔들린다 */
export function bookingWhen(b: { shoot_at: string | null; shoot_date: string | null }): string {
  if (b.shoot_at)
    return new Date(b.shoot_at).toLocaleString("ko-KR", {
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  if (b.shoot_date)
    return `${new Date(`${b.shoot_date}T00:00:00+09:00`).toLocaleDateString("ko-KR", {
      month: "long",
      day: "numeric",
      weekday: "short",
    })} · 시간 협의`;
  return "날짜 미정 (협의)";
}

export function BookingDetailDialog({
  booking,
  amCustomer,
  onClose,
}: {
  booking: BookingDetail;
  amCustomer: boolean;
  onClose: () => void;
}) {
  const total = booking.amount_krw ?? 0;
  const travel = booking.travel_fee_krw ?? 0;
  const shootFee = Math.max(0, total - travel);
  const fields = readStoredFieldValues(booking.custom_fields);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 font-kr"
      role="dialog"
      aria-modal="true"
      aria-label="예약 내용"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88svh] w-full max-w-sm overflow-y-auto rounded-2xl bg-surface p-5 shadow-pop"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-title font-semibold text-fg">예약 내용</p>
            <span className="mt-1 inline-block rounded-full bg-fg/[0.06] px-2.5 py-1 text-caption font-medium text-fg">
              {bookingStatusLabel(
                {
                  status: booking.status as BookingStatus,
                  transfer_marked_at: booking.transfer_marked_at,
                },
                amCustomer
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-fg/[0.06] hover:text-fg"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {booking.package_snapshot?.name && (
          <p className="mt-4 text-body font-semibold text-fg">{booking.package_snapshot.name}</p>
        )}

        <p className="mt-2 flex items-center gap-1.5 text-body-sm text-fg">
          <CalendarIcon className="h-4 w-4 shrink-0 text-faint" />
          {bookingWhen(booking)}
        </p>
        {booking.location_text && (
          <p className="mt-1 flex items-center gap-1.5 text-body-sm text-fg">
            <MapPinIcon className="h-4 w-4 shrink-0 text-faint" />
            {booking.location_text}
          </p>
        )}

        {fields.length > 0 && (
          <dl className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
            {fields.map((f) => (
              <div key={f.id} className="flex gap-2 text-caption">
                <dt className="w-16 shrink-0 text-muted">{f.label}</dt>
                <dd className="min-w-0 flex-1 text-fg">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {booking.memo && (
          <div className="mt-3 border-t border-line pt-3">
            <p className="text-caption text-muted">메모</p>
            <p className="mt-1 whitespace-pre-wrap text-caption text-fg">{booking.memo}</p>
          </div>
        )}

        <div className="mt-3 border-t border-line pt-3">
          {travel > 0 && (
            <div className="flex items-center justify-between text-caption text-muted">
              <span>촬영비 ₩{fmt.format(shootFee)}</span>
              <span>출장비 ₩{fmt.format(travel)}</span>
            </div>
          )}
          <div className="mt-0.5 flex items-center justify-between">
            <span className="text-body-sm text-muted">합계</span>
            <span className="text-title font-bold text-fg">₩{fmt.format(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

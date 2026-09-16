"use client";

// 결과물 전달 기한 — 예약 카드의 기한 표시, 작가의 연장 요청, 타임라인의 연장 카드.
// 연락처 전달(ContactHandover)과 같은 구조다: 제안은 예약 컬럼, 사건은 말풍선, 카드는 컬럼을 보고 그린다.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { proposeDeliveryExtension, respondDeliveryExtension } from "@/app/actions/delivery-extension";
import { OVERDUE_REFUND_DAYS, overdueDays } from "@/lib/delivery-deadline";

const dayFmt = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" });
const toInputDate = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** 예약 카드 안의 한 줄 — 기한과 초과 여부. 입금 확인 뒤부터 전달 전까지 */
export function DeliveryDueLine({
  dueAt,
  deliveredAt,
  proposedTo,
  amCustomer,
}: {
  dueAt: string | null;
  deliveredAt: string | null;
  proposedTo: string | null;
  amCustomer: boolean;
}) {
  if (!dueAt || deliveredAt) return null;
  const late = overdueDays(dueAt) ?? 0;
  return (
    <p className={`mt-2 text-caption ${late > 0 ? "text-danger" : "text-muted"}`}>
      결과물 전달 기한 {dayFmt.format(new Date(dueAt))}
      {late > 0 && ` · ${late}일 지남`}
      {late >= OVERDUE_REFUND_DAYS && amCustomer && " · 전액 환불을 요청할 수 있어요"}
      {proposedTo && ` · 연장 요청 중 (${dayFmt.format(new Date(proposedTo))})`}
    </p>
  );
}

/** 작가: 예약 카드 안의 [기한 연장 요청] — 날짜 하나 고르고 보낸다 */
export function ExtensionRequestButton({
  bookingId,
  dueAt,
  proposedTo,
}: {
  bookingId: string;
  dueAt: string | null;
  proposedTo: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  // 최소 선택일은 여는 순간에 계산한다 — 렌더 중에 현재 시각을 읽지 않는다
  const [minDate, setMinDate] = useState("");
  const [sending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (proposedTo)
    return (
      <p className="mt-2 text-caption text-muted">
        {dayFmt.format(new Date(proposedTo))}까지 연장을 요청했어요. 고객이 답하면 알려드려요.
      </p>
    );

  if (!open)
    return (
      <button
        type="button"
        onClick={() => {
          setMinDate(toInputDate(new Date(Math.max(Date.now(), dueAt ? new Date(dueAt).getTime() : 0) + 24 * 3600 * 1000)));
          setOpen(true);
        }}
        className="mt-2 w-full cursor-pointer rounded-full border border-line-strong py-2 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04]"
      >
        전달 기한 연장 요청
      </button>
    );

  return (
    <div className="mt-2 rounded-xl bg-surface-2 p-3">
      <label className="block text-caption text-muted">
        새 전달 기한
        <input
          id={`ext-date-${bookingId}`}
          type="date"
          min={minDate}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-body-sm text-fg outline-none focus:border-fg/40"
        />
      </label>
      <p className="mt-1.5 text-label text-faint">고객이 동의해야 기한이 바뀌어요. 동의 없이 14일 이상 늦으면 고객이 전액 환불을 요구할 수 있어요.</p>
      {error && <p className="mt-1 text-caption text-danger">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 cursor-pointer rounded-full border border-line-strong py-2 text-caption text-muted"
        >
          닫기
        </button>
        <button
          type="button"
          disabled={!date || sending}
          onClick={() =>
            start(async () => {
              setError(null);
              try {
                const fd = new FormData();
                fd.set("id", bookingId);
                fd.set("date", date);
                await proposeDeliveryExtension(fd);
                setOpen(false);
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "보내지 못했어요.");
              }
            })
          }
          className="flex-1 cursor-pointer rounded-full bg-fg py-2 text-caption font-semibold text-bg disabled:opacity-40"
        >
          {sending ? "보내는 중…" : "요청 보내기"}
        </button>
      </div>
    </div>
  );
}

/** 타임라인 말풍선 — 고객은 동의/거절, 작가는 상태만 */
export function ExtensionCardBubble({
  bookingId,
  proposedTo,
  dueAt,
  amCustomer,
  requestedLabel,
}: {
  bookingId: string;
  /** 아직 답하지 않은 제안. null 이면 이미 처리된 카드 */
  proposedTo: string | null;
  dueAt: string | null;
  amCustomer: boolean;
  /** 말풍선 본문(요청 당시 문구) — 처리된 뒤에도 무엇을 요청했는지 남는다 */
  requestedLabel: string;
}) {
  const router = useRouter();
  const [acting, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const respond = (accept: boolean) =>
    start(async () => {
      setError(null);
      try {
        const fd = new FormData();
        fd.set("id", bookingId);
        fd.set("accept", accept ? "1" : "0");
        await respondDeliveryExtension(fd);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "처리하지 못했어요.");
      }
    });

  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl border border-line bg-surface p-4">
      <p className="text-caption font-semibold text-muted">결과물 전달 기한 연장 요청</p>
      <p className="mt-1 text-body-sm text-fg">{requestedLabel}</p>
      {dueAt && <p className="mt-0.5 text-caption text-faint">지금 기한 {dayFmt.format(new Date(dueAt))}</p>}

      {proposedTo ? (
        amCustomer ? (
          <>
            <p className="mt-2 text-caption leading-relaxed text-muted">
              동의하면 기한이 {dayFmt.format(new Date(proposedTo))}까지로 바뀌어요. 동의하지 않으면 지금 기한이 그대로예요.
            </p>
            {error && <p className="mt-1 text-caption text-danger">{error}</p>}
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                disabled={acting}
                onClick={() => respond(false)}
                className="flex-1 cursor-pointer rounded-full border border-line-strong py-2 text-caption font-medium text-muted disabled:opacity-40"
              >
                동의하지 않아요
              </button>
              <button
                type="button"
                disabled={acting}
                onClick={() => respond(true)}
                className="flex-1 cursor-pointer rounded-full bg-fg py-2 text-caption font-semibold text-bg disabled:opacity-40"
              >
                {acting ? "처리 중…" : "동의해요"}
              </button>
            </div>
          </>
        ) : (
          <p className="mt-2 text-caption text-faint">고객이 답하면 결과가 여기와 알림으로 와요.</p>
        )
      ) : (
        <p className="mt-2 text-caption text-faint">처리된 요청이에요. 결과는 아래 안내를 봐주세요.</p>
      )}
    </div>
  );
}

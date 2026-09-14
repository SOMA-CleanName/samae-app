"use client";

// 일정 변경 — 예약 카드의 요청 버튼과 타임라인의 요청 카드 (취소환불정책 7조).
// 전달 기한 연장(DeliveryExtension)과 같은 구조다.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { proposeReschedule, respondReschedule } from "@/app/actions/reschedule";

const whenFmt = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

/** 예약 카드 안의 [일정 변경 요청] — 입금 확인 후 촬영 전, 답을 기다리는 요청이 없을 때 */
export function RescheduleRequestButton({
  bookingId,
  proposedAt,
  proposedByMe,
}: {
  bookingId: string;
  proposedAt: string | null;
  proposedByMe: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [minValue, setMinValue] = useState("");
  const [sending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (proposedAt)
    return (
      <p className="mt-2 text-caption text-muted">
        {proposedByMe
          ? `${whenFmt.format(new Date(proposedAt))}(으)로 변경을 요청했어요. 상대가 답하면 알려드려요.`
          : "일정 변경 요청이 와 있어요. 위 카드에서 답해주세요."}
      </p>
    );

  if (!open)
    return (
      <button
        type="button"
        onClick={() => {
          // 최소값은 여는 순간 계산 — 렌더 중에 현재 시각을 읽지 않는다
          const t = new Date(Date.now() + 2 * 60 * 60 * 1000);
          const kst = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(t);
          setMinValue(kst.replace(" ", "T"));
          setOpen(true);
        }}
        className="mt-2 w-full cursor-pointer rounded-full border border-line-strong py-2 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04]"
      >
        일정 변경 요청
      </button>
    );

  return (
    <div className="mt-2 rounded-xl bg-surface-2 p-3">
      <label className="block text-caption text-muted">
        새 촬영 일시
        <input
          id={`resched-${bookingId}`}
          type="datetime-local"
          min={minValue}
          step={1800}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-body-sm text-fg outline-none focus:border-fg/40"
        />
      </label>
      <p className="mt-1.5 text-label text-faint">
        상대가 동의하면 위약금 없이 바뀌고, 환불 기준은 새 날짜로 다시 계산돼요. 동의하지 않으면 원래 일정이 그대로예요.
      </p>
      {error && <p className="mt-1 text-caption text-danger">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="flex-1 cursor-pointer rounded-full border border-line-strong py-2 text-caption text-muted">
          닫기
        </button>
        <button
          type="button"
          disabled={!value || sending}
          onClick={() =>
            start(async () => {
              setError(null);
              try {
                const fd = new FormData();
                fd.set("id", bookingId);
                fd.set("shootAt", value);
                await proposeReschedule(fd);
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

/** 타임라인 카드 — 상대가 동의/거절, 제안한 쪽은 상태만 */
export function RescheduleCardBubble({
  bookingId,
  proposedAt,
  proposedBy,
  currentShootAt,
  amCustomer,
  requestedLabel,
}: {
  bookingId: string;
  /** 답을 기다리는 제안. null 이면 처리된 카드 */
  proposedAt: string | null;
  proposedBy: string | null;
  currentShootAt: string | null;
  amCustomer: boolean;
  requestedLabel: string;
}) {
  const router = useRouter();
  const [acting, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const iAmResponder = proposedBy === "customer" ? !amCustomer : amCustomer;

  const respond = (accept: boolean) =>
    start(async () => {
      setError(null);
      try {
        const fd = new FormData();
        fd.set("id", bookingId);
        fd.set("accept", accept ? "1" : "0");
        await respondReschedule(fd);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "처리하지 못했어요.");
      }
    });

  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl border border-line bg-surface p-4">
      <p className="text-caption font-semibold text-muted">촬영 일정 변경 요청</p>
      <p className="mt-1 text-body-sm text-fg">{requestedLabel}</p>
      {currentShootAt && (
        <p className="mt-0.5 text-caption text-faint">지금 일정 {whenFmt.format(new Date(currentShootAt))}</p>
      )}

      {proposedAt ? (
        iAmResponder ? (
          <>
            <p className="mt-2 text-caption leading-relaxed text-muted">
              동의하면 위약금 없이 일정이 바뀌고 환불 기준도 새 날짜로 다시 계산돼요.
              {amCustomer
                ? " 동의하지 않으면 원래 일정이 그대로예요."
                : " 동의하지 않으면 고객은 원래 일정에 촬영하거나 고객 사정으로 취소하게 돼요."}
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
          <p className="mt-2 text-caption text-faint">상대가 답하면 결과가 여기와 알림으로 와요.</p>
        )
      ) : (
        <p className="mt-2 text-caption text-faint">처리된 요청이에요. 결과는 아래 안내를 봐주세요.</p>
      )}
    </div>
  );
}

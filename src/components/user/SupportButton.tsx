"use client";

// 사매에 문의 — 환불·날짜 변경을 요청하는 유일한 창구.
//
// 채팅에서 작가에게 말하면 작가가 "환불해드릴게요" 라고 답해버리고, 그 순간 규정 밖의
// 약속이 생긴다. 작가는 그걸 결정할 수 있는 사람이 아니다(docs/32). 그래서 요청은
// 여기서 받아 운영 접수함으로 바로 보낸다.
//
// 종류를 고르면 해당 규정을 미리 보여준다 — 기대를 맞춰두면 답변이 실망으로 읽히지 않는다.

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { submitSupportRequest } from "@/app/actions/support";
import { SUPPORT_KINDS, SUPPORT_KIND_HINT, SUPPORT_KIND_LABEL, type SupportKind } from "@/lib/support";
import { XIcon } from "@/components/user/icons";
import { getCustomerRefundQuote, type CustomerRefundQuote } from "@/app/actions/refund-quote";

const fmt = new Intl.NumberFormat("ko-KR");
const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  timeZone: "Asia/Seoul",
});

export function SupportButton({
  bookingId,
  conversationId,
  variant = "card",
}: {
  bookingId: string;
  conversationId: string | null;
  /** card = 예약 카드 안(테두리 버튼) · list = 목록 카드 안(연한 버튼) */
  variant?: "card" | "list";
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SupportKind>("refund");
  // 환불을 고른 순간 '지금 취소하면 얼마인지' 를 먼저 보여준다 (docs/32 §6-6).
  // 요청을 넣고 나서 금액을 아는 구조면, 기대와 다른 숫자가 나올 때 그게 곧 분쟁이 된다.
  const [quote, setQuote] = useState<CustomerRefundQuote | null>(null);

  useEffect(() => {
    if (!open || kind !== "refund") return;
    let active = true;
    getCustomerRefundQuote(bookingId).then((q) => {
      if (active) setQuote(q);
    });
    return () => {
      active = false;
    };
  }, [open, kind, bookingId]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "list"
            ? "mt-2 flex w-full cursor-pointer items-center justify-center rounded-xl bg-fg/[0.06] py-3 text-body-sm font-semibold text-fg transition-colors hover:bg-fg/10"
            : "mt-2 w-full cursor-pointer rounded-full border border-line-strong py-2.5 text-body-sm font-medium text-muted transition-colors hover:bg-fg/[0.04]"
        }
      >
        사매에 문의
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 font-kr"
      role="dialog"
      aria-modal="true"
      aria-label="사매에 문의"
      onClick={() => setOpen(false)}
    >
      <form
        action={async (fd) => {
          await submitSupportRequest(fd);
          setOpen(false);
        }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88svh] w-full max-w-sm overflow-y-auto rounded-2xl bg-surface p-5 shadow-pop"
      >
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="conversationId" value={conversationId ?? ""} />
        <input type="hidden" name="kind" value={kind} />

        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-title font-semibold text-fg">사매에 문의</p>
            <p className="mt-1 text-body-sm text-muted">
              환불·날짜 변경은 사매가 확인하고 안내드려요.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="닫기"
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-fg/[0.06] hover:text-fg"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {SUPPORT_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`cursor-pointer rounded-full px-3 py-1.5 text-caption font-medium transition-colors ${
                kind === k ? "bg-fg text-bg" : "bg-fg/[0.06] text-muted hover:bg-fg/10"
              }`}
            >
              {SUPPORT_KIND_LABEL[k]}
            </button>
          ))}
        </div>

        {/* 고르자마자 규정을 보여준다 — 답변을 기다리는 동안 기대가 어긋나지 않게 */}
        <p className="mt-2 rounded-xl bg-surface-2 p-3 text-caption leading-relaxed text-muted">
          {SUPPORT_KIND_HINT[kind]}
        </p>

        {/* 환불 견적 — 어드민 판정과 같은 함수(refundQuote)가 계산한 값이다 */}
        {kind === "refund" && quote && (
          <div className="mt-2 rounded-xl bg-brand/[0.06] p-3.5 ring-1 ring-brand/20">
            {quote.refundKrw > 0 ? (
              <p className="text-body-sm text-fg">
                지금 취소하시면 <b>₩{fmt.format(quote.refundKrw)}</b>이 환불됩니다.
              </p>
            ) : (
              <p className="text-body-sm font-semibold text-fg">
                지금은 취소하셔도 환불되지 않습니다.
              </p>
            )}
            <p className="mt-1 text-caption text-muted">
              결제 ₩{fmt.format(quote.amountKrw)}
              {quote.penaltyKrw > 0 && ` · 취소 위약금 ₩${fmt.format(quote.penaltyKrw)}`}
            </p>
            {quote.penaltyStartsAt && quote.refundKrw > 0 && (
              <p className="mt-1.5 border-t border-brand/15 pt-1.5 text-caption text-muted">
                촬영 7일 전({dateFmt.format(new Date(quote.penaltyStartsAt))})부터는 환불되지
                않습니다.
              </p>
            )}
          </div>
        )}

        <label className="mt-3 block">
          <span className="mb-1.5 block text-caption text-muted">어떤 상황인지 적어주세요</span>
          <textarea
            name="body"
            required
            rows={4}
            maxLength={1000}
            placeholder="예: 촬영 당일 일정이 생겨 날짜를 옮기고 싶어요."
            className="w-full resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-body-sm outline-none transition-colors focus:border-fg/40"
          />
        </label>

        <p className="mt-2 text-caption text-faint">
          접수되면 채팅에도 기록이 남아요. 상대방에게는 내용이 아니라 접수 사실만 보여요.
        </p>

        <SubmitButton />
      </form>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-4 w-full cursor-pointer rounded-full bg-fg py-3 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "접수 중…" : "문의 보내기"}
    </button>
  );
}

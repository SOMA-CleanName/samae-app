"use client";

// 운영 환불 — 규정대로 얼마가 나가는지 보여주고, 예외 판정만 사람이 고른다.
//
// 금액을 손으로 입력받지 않는다. 운영자가 매번 두 시계(결제+7일 / 촬영−7일)를 세고 곱셈을 하면 반드시 틀리고,
// 틀린 금액은 고객·작가 어느 쪽이든 손해로 돌아온다. 계산은 lib/refund.ts 가 하고
// 여기서는 그 결과를 확인시킨 뒤 실행만 한다. (docs/32)
//
// 사람이 고를 수 있는 건 '규정 밖 판정' 둘뿐이다:
//   · 천재지변  — 교통이 마비되는 수준. 전액 환불 + 수수료 면제 (아무도 손해 없음)
//   · 작가 귀책 — 전액 환불하되 수수료는 유지. 그 부담이 곧 패널티다

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { adminRefund } from "./actions";
import type { RefundOverride, RefundQuote } from "@/lib/refund";

const fmt = new Intl.NumberFormat("ko-KR");

const OVERRIDES: { value: "" | RefundOverride; label: string; hint: string }[] = [
  { value: "", label: "규정대로", hint: "결제 후 7일(청약철회) · 촬영 7일 전 기준으로 자동 판정" },
  {
    value: "force_majeure",
    label: "천재지변",
    hint: "교통이 마비되는 수준 — 전액 환불, 수수료 면제",
  },
  {
    value: "photographer_fault",
    label: "작가 귀책",
    hint: "전액 환불, 수수료는 작가 부담으로 유지",
  },
];

export function AdminRefundButton({
  bookingId,
  quote,
  amountKrw,
  label,
}: {
  bookingId: string;
  quote: RefundQuote;
  /** 고객이 낸 총액 — 예외 판정(전액 환불) 미리보기에 필요하다 */
  amountKrw: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState<"" | RefundOverride>("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 cursor-pointer rounded-lg border border-line-strong px-3 py-1.5 text-caption font-medium text-fg transition-colors hover:bg-fg/[0.05]"
      >
        환불
      </button>
    );
  }

  // 예외 판정을 고르면 결과가 달라진다 — 규정 판정만 서버가 계산해 왔으므로
  // 전액 환불 두 경우는 여기서 미리 그려준다 (서버가 다시 판정해 최종 확정).
  const preview =
    override === ""
      ? {
          percent: quote.percent,
          refundKrw: quote.refundKrw,
          feeWaived: quote.feeWaived,
          reason: quote.reason,
        }
      : {
          percent: 100,
          refundKrw: amountKrw,
          feeWaived: override === "force_majeure",
          reason:
            override === "force_majeure"
              ? "천재지변 — 전액 환불하고 수수료도 면제해요."
              : "작가 귀책 — 전액 환불하고 수수료는 작가가 부담해요.",
        };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 font-kr"
      onClick={() => setOpen(false)}
    >
      <form
        action={adminRefund}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-pop"
      >
        <input type="hidden" name="id" value={bookingId} />
        <input type="hidden" name="override" value={override} />

        <p className="text-body-sm font-semibold text-fg">환불을 처리할까요?</p>
        <p className="mt-1 text-caption text-muted">{label}</p>

        <fieldset className="mt-3">
          <legend className="text-caption text-muted">판정</legend>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {OVERRIDES.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-line px-3 py-2 has-[:checked]:border-fg has-[:checked]:bg-fg/[0.03]"
              >
                <input
                  type="radio"
                  checked={override === o.value}
                  onChange={() => setOverride(o.value)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-fg"
                />
                <span className="min-w-0">
                  <span className="block text-caption font-medium text-fg">{o.label}</span>
                  <span className="block text-caption text-faint">{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-3 rounded-lg bg-bg-2 p-3">
          <p className="text-caption text-fg">
            고객 환불 <b>{preview.percent}% · ₩{fmt.format(Math.round(preview.refundKrw))}</b>
            <br />
            사매 수수료 <b>{preview.feeWaived ? "면제" : `₩${fmt.format(quote.feeKrw)} 유지`}</b>
          </p>
          <p className="mt-1 text-caption text-faint">{preview.reason}</p>
        </div>

        <p className="mt-3 text-caption text-danger">
          되돌릴 수 없어요. <b>실제 송금은 사람이 합니다</b> — 이 버튼은 기록만 남겨요.
        </p>

        <label className="mt-3 flex flex-col gap-1">
          <span className="text-caption text-muted">메모 (양측 알림에 보여요, 비우면 자동 문구)</span>
          <input
            name="note"
            maxLength={200}
            placeholder="예: 고객 요청으로 환불 처리했습니다."
            className="rounded-lg border border-line bg-bg px-3 py-2 text-body-sm outline-none focus:border-fg/40"
          />
        </label>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex-1 cursor-pointer rounded-lg px-3 py-2 text-body-sm font-semibold text-muted transition-colors hover:bg-fg/[0.06]"
          >
            닫기
          </button>
          <SubmitButton />
        </div>
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
      className="flex-1 cursor-pointer rounded-lg bg-danger px-3 py-2 text-body-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "처리 중…" : "환불 처리"}
    </button>
  );
}

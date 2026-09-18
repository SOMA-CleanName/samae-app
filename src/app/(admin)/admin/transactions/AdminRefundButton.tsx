"use client";

// 운영 환불 — 규정대로 얼마가 나가는지 보여주고, 예외 판정만 사람이 고른다.
//
// 금액을 손으로 입력받지 않는다(부분 이행 한 경우만 예외). 계산은 lib/refund.ts 가 하고
// 여기서는 그 결과를 확인시킨 뒤 실행만 한다. 취소 시점은 고객이 신청한 시각(refund_due_at)이라
// 운영이 늦게 눌러도 구간이 밀리지 않는다 (취소환불 5조 3항).
//
// 사람이 고를 수 있는 '규정 밖 판정':
//   · 천재지변   — 전액 환불, 누구에게도 수수료 없음
//   · 작가 사정  — 전액 환불, 수수료 상당액을 작가에게 청구
//   · 작가 노쇼  — 작가 사정과 같은 돈. 이력 집계용으로 따로 둔다
//   · 고객 노쇼  — 위약금 100%. 배분은 그 작가의 수수료율을 따른다
//   · 부분 이행  — 촬영이 일부 진행된 뒤의 취소. 운영이 환불액을 적는다 (10조 4항)

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { adminRefund } from "./actions";
import type { RefundOverride, RefundQuote } from "@/lib/refund";
import { refundQuote } from "@/lib/refund";

const fmt = new Intl.NumberFormat("ko-KR");

const OVERRIDES: { value: "" | RefundOverride; label: string; hint: string }[] = [
  { value: "", label: "규정대로", hint: "촬영까지 남은 날수로 자동 판정 (8일+ 0% · 4~7일 40% · 3일~당일 90%)" },
  { value: "force_majeure", label: "천재지변", hint: "교통이 마비되는 수준 — 전액 환불, 수수료 없음" },
  { value: "photographer_fault", label: "작가 사정", hint: "전액 환불, 수수료 상당액을 작가에게 청구" },
  { value: "photographer_no_show", label: "작가 노쇼", hint: "작가 사정과 같은 처리. 이력에 노쇼로 남는다" },
  // 배분 비율은 작가마다 다르다(요율 연동) — 실제 숫자는 아래 moneyLine 이 보여준다
  { value: "customer_no_show", label: "고객 노쇼", hint: "취소 통보 없이 불참 — 위약금 100%" },
  { value: "partial", label: "부분 이행", hint: "촬영이 일부 진행된 뒤의 취소 — 환불액을 직접 적는다" },
];

export function AdminRefundButton({
  bookingId,
  quote,
  amountKrw,
  feeRate,
  label,
}: {
  bookingId: string;
  quote: RefundQuote;
  /** 고객이 낸 총액 — 예외 판정 미리보기에 필요하다 */
  amountKrw: number;
  /** 이 예약의 수수료율 — 위약금 배분(작가 : 사매)이 여기서 갈린다.
   *  넘기지 않으면 기본 20%로 계산돼, 요율이 다른 작가의 건에서 화면과 실행값이 어긋난다. */
  feeRate: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState<"" | RefundOverride>("");
  const [manual, setManual] = useState("");

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

  // 예외 판정을 고르면 결과가 달라진다. 서버와 같은 순수 함수를 클라이언트에서 다시 돌려
  // 미리 보여준다 — 서버가 최종 확정하지만 숫자는 같은 함수에서 나온다.
  const preview: RefundQuote =
    override === ""
      ? quote
      : refundQuote({
          shootAt: null,
          transferMarkedAt: "override", // 입금 여부만 필요하다 — 판정은 override 가 덮어쓴다
          amountKrw,
          travelFeeKrw: 0,
          feeKrw: override === "partial" ? 0 : quote.feeClaimKrw || quote.feeKrw,
          // 서버(quoteRefund)는 예약의 요율로 나눈다 — 여기서 빠뜨리면 미리보기만 20%가 된다
          feeRate,
          override,
          manualRefundKrw: Number(manual.replace(/[^0-9]/g, "")) || 0,
        });

  const moneyLine =
    preview.penaltyKrw > 0
      ? `위약금 ₩${fmt.format(preview.penaltyKrw)} → 작가 ₩${fmt.format(preview.penaltyPhotographerKrw)} · 수수료 ₩${fmt.format(preview.penaltyCompanyKrw)} · 부가세 ₩${fmt.format(preview.penaltyVatKrw)}`
      : preview.feeClaimKrw > 0
        ? `작가에게 수수료 상당액 ₩${fmt.format(preview.feeClaimKrw)} 청구`
        : preview.feeWaived
          ? "수수료 없음"
          : `사매 수수료 ₩${fmt.format(preview.feeKrw)} 유지`;

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

        {override === "partial" && (
          <label className="mt-3 flex flex-col gap-1">
            <span className="text-caption text-muted">고객에게 돌려줄 금액 (원)</span>
            <input
              name="manualRefundKrw"
              inputMode="numeric"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder={`0 ~ ${fmt.format(amountKrw)}`}
              className="rounded-lg border border-line bg-bg px-3 py-2 text-body-sm outline-none focus:border-fg/40"
            />
          </label>
        )}

        <div className="mt-3 rounded-lg bg-bg-2 p-3">
          <p className="text-caption text-fg">
            고객 환불 <b>{preview.percent}% · ₩{fmt.format(Math.round(preview.refundKrw))}</b>
            <br />
            {moneyLine}
          </p>
          <p className="mt-1 text-caption text-faint">{preview.reason}</p>
        </div>

        <p className="mt-3 text-caption text-danger-ink">
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

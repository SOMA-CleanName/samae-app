"use client";

// 수락 → 입금 안내 다이얼로그.
//
// 수락을 누르면 카드가 입금 단계로 바뀌긴 하지만, 손님은 "수락했으니 끝" 이라 여기고 방을 떠난다.
// 정작 해야 할 일(계좌로 송금 → 돌아와서 [입금 완료])은 카드 안쪽에 조용히 놓여 있었다.
// 그래서 수락 직후 이 창을 띄워 계좌·금액·다음 행동을 한 번에 못박는다.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getBookingPayoutAccount } from "../actions";
import { markTransferSent } from "@/app/actions/payments";
import { CheckIcon, WalletIcon, XIcon } from "@/components/user/icons";
import { Spinner } from "@/components/ui";
import type { PayoutAccount } from "@/lib/payments";
import { PolicyNote } from "./PolicyNote";

const fmt = new Intl.NumberFormat("ko-KR");

export function AcceptPayDialog({
  bookingId,
  amountKrw,
  account: preloaded,
  onClose,
}: {
  bookingId: string;
  amountKrw: number;
  /** 서버가 미리 실어 보낸 사매 계좌. 있으면 조회 없이 바로 그린다 —
   *  없으면 창이 열리자마자 "계좌 불러오는 중…" 이 깜빡인다. */
  account?: PayoutAccount | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [fetched, setFetched] = useState<PayoutAccount | null>(null);
  const account = preloaded ?? fetched;
  const [loading, setLoading] = useState(!preloaded);
  const [copied, setCopied] = useState(false);
  const [sending, startSend] = useTransition();

  // 입금하고 돌아온 손님이 이 창에서 바로 끝낼 수 있게 — 카드까지 내려가 다시 찾지 않는다
  function markPaid() {
    const fd = new FormData();
    fd.set("id", bookingId);
    startSend(async () => {
      await markTransferSent(fd);
      router.refresh();
      onClose();
    });
  }

  useEffect(() => {
    if (preloaded) return;
    let active = true;
    getBookingPayoutAccount(bookingId).then((acc) => {
      if (!active) return;
      setFetched(acc);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [bookingId, preloaded]);

  // 계좌번호는 옮겨 적다 틀리기 쉽다 — 복사를 기본 동선으로
  const copy = async () => {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account.number.replace(/[^0-9]/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 클립보드 거부 — 계좌번호는 화면에 그대로 보인다 */
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 font-kr"
      role="dialog"
      aria-modal="true"
      aria-label="입금 안내"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88svh] w-full max-w-sm overflow-y-auto rounded-2xl bg-surface p-5 shadow-pop"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-1.5 text-title font-semibold text-fg">
              <CheckIcon className="h-5 w-5 text-success" />
              예약을 수락했어요
            </p>
            <p className="mt-1 text-body-sm text-muted">
              아래 계좌로 입금하시면 예약이 잡혀요.
            </p>
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

        <div className="mt-4 rounded-xl bg-surface-2 p-3.5">
          <p className="flex items-center gap-1.5 text-caption font-semibold text-muted">
            <WalletIcon className="h-4 w-4" />
            사매 계좌로 안전하게
          </p>
          {loading ? (
            <div className="mt-2 flex items-center gap-2 text-caption text-muted">
              <Spinner className="h-4 w-4" />
              계좌 정보를 불러오는 중…
            </div>
          ) : account ? (
            <>
              <p className="mt-2 text-body-sm text-fg">
                {account.bank} <span className="font-mono">{account.number}</span>
              </p>
              <p className="text-caption text-muted">예금주 {account.holder}</p>
              <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2.5">
                <span className="text-caption text-faint">보낼 금액</span>
                <span className="text-title font-bold text-fg">₩{fmt.format(amountKrw)}</span>
              </div>
              <button
                type="button"
                onClick={copy}
                className="mt-2.5 w-full cursor-pointer rounded-lg border border-line-strong py-2 text-caption font-medium text-fg transition-colors hover:bg-fg/[0.04]"
              >
                {copied ? "복사했어요" : "계좌번호 복사"}
              </button>
            </>
          ) : (
            <p className="mt-2 text-caption text-warning">
              입금 계좌 안내를 준비 중이에요. 잠시 후 예약 카드에서 다시 확인해주세요.
            </p>
          )}
        </div>

        {/* 이 창의 진짜 목적 — 입금하고 '돌아와서 눌러야 한다' 는 걸 놓치지 않게.
            순서를 번호로 끊어 보여준다. 문장으로 흘리면 읽히지 않는다. */}
        <ol className="mt-4 flex flex-col gap-2 rounded-xl bg-brand/[0.08] p-3.5 ring-1 ring-brand/25">
          <li className="flex items-start gap-2 text-body-sm text-fg">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-caption font-bold text-white">
              1
            </span>
            위 계좌로 <b>₩{fmt.format(amountKrw)}</b> 입금하기
          </li>
          <li className="flex items-start gap-2 text-body-sm text-fg">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-caption font-bold text-white">
              2
            </span>
            <span>
              <b>다시 돌아와 아래 [입금 완료]를 누르기</b>
              <br />
              <span className="text-caption text-muted">눌러야 예약이 확정돼요.</span>
            </span>
          </li>
        </ol>

        {/* 무엇에 동의하고 보내는지 — 입금 버튼 바로 위가 유일하게 읽히는 자리다 */}
        <PolicyNote />

        <button
          type="button"
          onClick={markPaid}
          disabled={sending || !account}
          className="mt-4 w-full cursor-pointer rounded-full bg-fg py-3 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {sending ? "처리 중…" : "입금 완료"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full cursor-pointer py-2 text-caption text-muted transition-colors hover:text-fg"
        >
          아직 입금 전이에요 — 나중에
        </button>
      </div>
    </div>
  );
}

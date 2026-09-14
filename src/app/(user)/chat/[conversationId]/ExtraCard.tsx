"use client";

// 추가 결제 — 예약 카드의 요청 버튼과 타임라인의 요청 카드 (회원약관 8조).
// 카드 본문(body JSON)은 요청 당시 내용이고, 상태는 booking_extras 행(extras prop)이 진실이다.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markExtraDelivered, markExtraTransfer, requestExtra, respondExtra } from "@/app/actions/extras";
import { EXTRA_KIND_LABEL, extraStatusLabel, type BookingExtra, type ExtraCardBody } from "@/lib/extras";
import type { PayoutAccount } from "@/lib/payments";

const fmt = new Intl.NumberFormat("ko-KR");

/** 작가: 예약 카드 안의 [추가 결제 요청] */
export function ExtraRequestButton({ bookingId, shootPassed }: { bookingId: string; shootPassed: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 w-full cursor-pointer rounded-full border border-line-strong py-2 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04]"
      >
        추가 결제 요청
      </button>
    );

  return (
    <div className="mt-2 rounded-xl bg-surface-2 p-3">
      <label className="block text-caption text-muted">
        추가 작업 항목
        <input
          id={`extra-title-${bookingId}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={60}
          placeholder="예: 보정본 5장 추가"
          className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-body-sm text-fg outline-none focus:border-fg/40"
        />
      </label>
      <label className="mt-2 block text-caption text-muted">
        금액 (원)
        <input
          id={`extra-amount-${bookingId}`}
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="50000"
          className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-body-sm text-fg outline-none focus:border-fg/40"
        />
      </label>
      <p className="mt-1.5 text-label text-faint">
        {shootPassed
          ? "촬영 후 결과물 추가금이에요. 전달 전에는 전액 환불되고, 전달 후에는 환불되지 않아요."
          : "촬영 전 추가금이라 원래 예약과 합산돼요. 위약금·수수료도 합산 금액 기준이에요."}{" "}
        고객이 수락하고 사매 계좌로 입금하면 사매가 확인해요.
      </p>
      {error && <p className="mt-1 text-caption text-danger">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="flex-1 cursor-pointer rounded-full border border-line-strong py-2 text-caption text-muted">
          닫기
        </button>
        <button
          type="button"
          disabled={!title.trim() || !amount || sending}
          onClick={() =>
            start(async () => {
              setError(null);
              try {
                const fd = new FormData();
                fd.set("id", bookingId);
                fd.set("title", title);
                fd.set("amountKrw", amount);
                await requestExtra(fd);
                setOpen(false);
                setTitle("");
                setAmount("");
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

/** 타임라인 카드 */
export function ExtraCardBubble({
  body,
  extra,
  amCustomer,
  amPhotographer,
  account,
}: {
  body: ExtraCardBody;
  /** booking_extras 행. 없으면(아직 로드 전·삭제) 요청 당시 내용만 그린다 */
  extra: BookingExtra | null;
  amCustomer: boolean;
  amPhotographer: boolean;
  /** 사매 입금 계좌 — 고객이 수락한 뒤 입금할 곳 */
  account: PayoutAccount | null;
}) {
  const router = useRouter();
  const [acting, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "처리하지 못했어요.");
      }
    });
  const act = (action: (fd: FormData) => Promise<void>, extraArgs: Record<string, string> = {}) => () =>
    run(async () => {
      const fd = new FormData();
      fd.set("id", body.extraId);
      for (const [k, v] of Object.entries(extraArgs)) fd.set(k, v);
      await action(fd);
    });

  const status = extra?.status ?? "requested";
  const label = extra ? extraStatusLabel(extra) : "";

  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-caption font-semibold text-muted">추가 결제 요청 · {EXTRA_KIND_LABEL[body.kind]}</p>
        {label && <span className="text-label text-faint">{label}</span>}
      </div>
      <p className="mt-1 text-body-sm font-medium text-fg">{body.title}</p>
      <p className="text-body font-bold text-fg">₩{fmt.format(body.amountKrw)}</p>
      <p className="mt-1 text-label text-faint">
        {body.kind === "pre_shoot"
          ? "촬영 전 추가금이라 원래 예약과 합산돼요. 환불도 합산 금액 기준이에요."
          : "결과물 전달 전에는 전액 환불, 전달 후에는 환불되지 않아요."}
      </p>

      {error && <p className="mt-1.5 text-caption text-danger">{error}</p>}

      {/* 고객: 수락/거절 */}
      {amCustomer && status === "requested" && (
        <div className="mt-2.5 flex gap-2">
          <button type="button" disabled={acting} onClick={act(respondExtra, { accept: "0" })} className="flex-1 cursor-pointer rounded-full border border-line-strong py-2 text-caption font-medium text-muted disabled:opacity-40">
            거절해요
          </button>
          <button type="button" disabled={acting} onClick={act(respondExtra, { accept: "1" })} className="flex-1 cursor-pointer rounded-full bg-fg py-2 text-caption font-semibold text-bg disabled:opacity-40">
            {acting ? "처리 중…" : "수락하고 입금할게요"}
          </button>
        </div>
      )}

      {/* 고객: 수락 후 입금 안내 + [입금 완료] */}
      {amCustomer && status === "accepted" && !extra?.transfer_marked_at && (
        <div className="mt-2.5 rounded-xl bg-surface-2 p-3">
          <p className="text-caption font-semibold text-muted">사매 계좌로 입금해주세요</p>
          {account ? (
            <>
              <p className="mt-1 text-body-sm text-fg">
                {account.bank} <span className="font-mono">{account.number}</span>
              </p>
              <p className="text-caption text-muted">예금주 {account.holder} · ₩{fmt.format(body.amountKrw)}</p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(account.number.replace(/[^0-9]/g, ""));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    /* 계좌번호는 화면에 그대로 보인다 */
                  }
                }}
                className="mt-2 w-full cursor-pointer rounded-lg border border-line-strong py-1.5 text-caption font-medium text-fg"
              >
                {copied ? "복사했어요" : "계좌번호 복사"}
              </button>
            </>
          ) : (
            <p className="mt-1 text-caption text-warning">입금 계좌 안내를 준비 중이에요. 잠시 후 다시 확인해주세요.</p>
          )}
          <button type="button" disabled={acting || !account} onClick={act(markExtraTransfer)} className="mt-2 w-full cursor-pointer rounded-full bg-fg py-2 text-caption font-semibold text-bg disabled:opacity-40">
            {acting ? "처리 중…" : "입금 완료"}
          </button>
        </div>
      )}

      {amCustomer && status === "accepted" && extra?.transfer_marked_at && (
        <p className="mt-2 text-caption text-success">입금 완료를 알렸어요. 사매가 확인하면 반영돼요.</p>
      )}

      {/* 작가: 촬영 후 추가금은 전달 완료를 눌러 닫는다 */}
      {amPhotographer && status === "paid" && body.kind === "post_shoot" && !extra?.delivered_at && (
        <button type="button" disabled={acting} onClick={act(markExtraDelivered)} className="mt-2.5 w-full cursor-pointer rounded-full bg-fg py-2 text-caption font-semibold text-bg disabled:opacity-40">
          {acting ? "처리 중…" : "결과물 전달 완료"}
        </button>
      )}
      {amPhotographer && status === "requested" && <p className="mt-2 text-caption text-faint">고객이 답하면 알려드려요.</p>}
      {amPhotographer && status === "accepted" && (
        <p className="mt-2 text-caption text-faint">{extra?.transfer_marked_at ? "고객이 입금을 알렸어요. 사매가 확인 중이에요." : "고객이 수락했어요. 입금을 기다리는 중이에요."}</p>
      )}
    </div>
  );
}
